/**
 * BusyBee - the AI assistant brand for RouteHive. Currently one capability:
 * a short pre-visit brief summarizing what's known about a lead before a
 * rep knocks. Calls the Claude API server-side (never from the browser -
 * the API key stays on the server).
 *
 * UNTESTED against the live Anthropic API in this build environment - there
 * is no API key available here to actually invoke it. The request is built
 * to match the documented Messages API shape; verify with a real
 * ANTHROPIC_API_KEY once deployed before relying on it. If the request
 * shape is ever wrong, this fails closed (returns null / a clear error)
 * rather than silently breaking the calling endpoint.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'; // fast/cheap - a short summarization task, not a reasoning-heavy one

function buildLeadContext(lead) {
  const lines = [];
  lines.push(`Address: ${lead.address}, ${lead.city}, ${lead.state} ${lead.zip}`);
  const ownerName = lead.full_name || lead.owner_name_raw;
  if (ownerName) lines.push(`Homeowner: ${ownerName}`);
  if (lead.co_owner_name) lines.push(`Co-owner: ${lead.co_owner_name}`);
  if (lead.purchase_date) lines.push(`Home purchased: ${lead.purchase_date}${lead.sale_price ? ` for $${lead.sale_price}` : ''}`);
  lines.push(`Current disposition: ${lead.disposition}`);
  lines.push(`Visited before: ${lead.visited ? 'yes' : 'no'}`);
  lines.push(`Has solar already: ${lead.has_solar ? 'yes' : 'no'}`);
  lines.push(`Marked no further attempt: ${lead.no_further_attempt ? 'yes' : 'no'}`);

  if (lead.notes && lead.notes.length > 0) {
    lines.push('Past notes (most recent first):');
    lead.notes.slice(0, 8).forEach((note) => {
      const date = new Date(note.created_at).toLocaleDateString();
      lines.push(`- [${date}] ${note.body}`);
    });
  } else {
    lines.push('No notes on file yet.');
  }

  return lines.join('\n');
}

async function callClaude(systemPrompt, userContent, maxTokens) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it in your environment variables to enable BusyBee.'
    );
  }

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`BusyBee request failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((block) => block.type === 'text');
  if (!textBlock) {
    throw new Error('BusyBee returned no text content');
  }

  return textBlock.text.trim();
}

/**
 * @param {object} lead - the assembled lead detail object (same shape
 *   returned by GET /api/leads/:id, including its `notes` array)
 * @returns {Promise<string>} a short (2-4 sentence) pre-visit brief
 */
async function generateBrief(lead) {
  const leadContext = buildLeadContext(lead);
  return callClaude(
    "You are BusyBee, a field sales assistant. Write a short pre-visit brief (2-4 sentences, plain text, no headers or bullet points) for a door-to-door solar sales rep about to knock on this specific door. Highlight anything actionable from the notes or history - a past objection, a promise made, a good sign, or a reason to reconsider knocking at all. Be direct and concrete. If there's nothing notable, just say so briefly.",
    leadContext,
    300
  );
}

/**
 * Drafts a follow-up message for a rep to review, edit, and send themselves
 * from their own phone's Mail or Messages app. This function only generates
 * text - it never sends anything. The calling endpoint and UI are
 * responsible for handing the draft to the device's native app for the
 * human to review and actually dispatch.
 *
 * @param {object} lead
 * @param {'email'|'text'} channel
 * @param {string} repName - signs the draft with the rep's own name
 * @returns {Promise<{subject?: string, body: string}>}
 */
async function generateMessageDraft(lead, channel, repName) {
  const leadContext = buildLeadContext(lead);
  const repLine = repName ? `The message should be signed with the rep's first name: ${repName}.` : '';

  if (channel === 'email') {
    const raw = await callClaude(
      `You are BusyBee, a field sales assistant. Draft a short, friendly follow-up email to a homeowner from a solar sales rep, based on the lead history below. ${repLine} Keep the body to 3-5 sentences, warm but not pushy, referencing anything specific from the notes if relevant. Respond in exactly this format with no extra text:\nSUBJECT: <subject line>\nBODY:\n<email body>`,
      leadContext,
      400
    );
    const subjectMatch = raw.match(/SUBJECT:\s*(.+)/);
    const bodyMatch = raw.match(/BODY:\s*([\s\S]+)/);
    return {
      subject: subjectMatch ? subjectMatch[1].trim() : 'Following up',
      body: bodyMatch ? bodyMatch[1].trim() : raw
    };
  }

  if (channel === 'text') {
    const body = await callClaude(
      `You are BusyBee, a field sales assistant. Draft a short, friendly follow-up text message to a homeowner from a solar sales rep, based on the lead history below. ${repLine} Keep it under 300 characters, casual but professional, no email-style greeting/sign-off formality. Respond with only the message text, nothing else.`,
      leadContext,
      150
    );
    return { body };
  }

  throw new Error(`Unknown channel: ${channel}`);
}

/**
 * Drafts a very short appointment reminder (2-3 sentences, one clear CTA).
 * Only addresses the recipient by name if there's an actual enriched
 * contact name on file - a bare address/lead with no known homeowner name
 * gets a generic, name-free draft rather than a guessed or placeholder
 * greeting. Like generateMessageDraft, this only generates text - sending
 * is a human action in their own Mail/Messages app.
 *
 * @param {object} appointment - { scheduled_at, duration_minutes }
 * @param {object} lead - the lead detail object (address, full_name if any)
 * @param {'email'|'text'} channel
 * @param {'24h'|'1h'} reminderType
 * @param {string} repName
 * @returns {Promise<{subject?: string, body: string}>}
 */
async function generateReminderMessage(appointment, lead, channel, reminderType, repName) {
  const hasName = !!lead.full_name;
  const nameLine = hasName
    ? `The homeowner's name on file is ${lead.full_name} - address them by name.`
    : 'There is no homeowner name on file - do NOT invent or guess a name; use a generic greeting or none at all.';

  const apptTime = new Date(appointment.scheduled_at).toLocaleString('en-US', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  const timingLine =
    reminderType === '24h'
      ? 'This is a 24-hour advance reminder, sent the day before the appointment.'
      : 'This is a final reminder, sent about 1 hour before the appointment - keep urgency low-key, just a quick heads-up, not alarming.';

  const context = `Appointment: ${apptTime}, at ${lead.address}. ${nameLine} ${timingLine} ${repName ? `Sign off with the rep's first name: ${repName}.` : ''}`;

  const lengthRule =
    channel === 'text'
      ? 'Under 300 characters total. No greeting formality, no sign-off - just the message.'
      : '2-3 sentences MAXIMUM in the body, not a full email. Include a short subject line.';

  if (channel === 'email') {
    const raw = await callClaude(
      `You are BusyBee, a field sales assistant. Draft a VERY SHORT appointment reminder email. ${lengthRule} One clear call-to-action (e.g. "Reply to confirm" or "See you then!"). ${nameLine} Respond in exactly this format with no extra text:\nSUBJECT: <subject line>\nBODY:\n<email body>`,
      context,
      200
    );
    const subjectMatch = raw.match(/SUBJECT:\s*(.+)/);
    const bodyMatch = raw.match(/BODY:\s*([\s\S]+)/);
    return {
      subject: subjectMatch ? subjectMatch[1].trim() : 'Appointment reminder',
      body: bodyMatch ? bodyMatch[1].trim() : raw
    };
  }

  if (channel === 'text') {
    const body = await callClaude(
      `You are BusyBee, a field sales assistant. Draft a VERY SHORT appointment reminder text message. ${lengthRule} One clear call-to-action. ${nameLine} Respond with only the message text, nothing else.`,
      context,
      100
    );
    return { body };
  }

  throw new Error(`Unknown channel: ${channel}`);
}

module.exports = { generateBrief, generateMessageDraft, generateReminderMessage };
