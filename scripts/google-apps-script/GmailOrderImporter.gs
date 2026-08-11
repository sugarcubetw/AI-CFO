/**
 * 方糖民宿 Gmail 訂單同步器（Google Apps Script）
 *
 * Script Properties 必填：
 * - OPS_SITE_URL
 * - OPS_SITE_BYPASS_TOKEN
 */

const JOB_ID = "gmail-order-import";
// Keep Gmail search deliberately broad and apply the event-subject filter in
// code. GmailApp search parsing can behave differently from the Gmail web UI
// when several quoted subject clauses are grouped together.
const ORDER_QUERY = "in:anywhere from:owlnest@owlting.com newer_than:30d";

function syncOwlNestOrders() {
  const startedAt = new Date();
  try {
    const messages = GmailApp.search(ORDER_QUERY, 0, 100)
      .flatMap((thread) => thread.getMessages())
      .filter((message) => /訂單成立通知|新預定通知|訂單修改通知|訂單取消通知/.test(message.getSubject()))
      .sort((left, right) => left.getDate().getTime() - right.getDate().getTime())
      .slice(-100)
      .map((message) => ({
        id: message.getId(),
        from: message.getFrom(),
        subject: message.getSubject(),
        body: message.getPlainBody(),
        emailTs: message.getDate().toISOString(),
      }));

    const result = messages.length
      ? postJson_("/api/import/gmail", { messages })
      : { received: 0, parsed: 0, import: { inserted: 0, updated: 0, duplicates: 0, errors: [] } };
    const summary = {
      scanned: messages.length,
      parsed: result.parsed || 0,
      inserted: result.import && result.import.inserted || 0,
      updated: result.import && result.import.updated || 0,
      duplicates: result.import && result.import.duplicates || 0,
      errors: (result.parseErrors || []).length + (result.import && result.import.errors || []).length,
      durationMs: new Date().getTime() - startedAt.getTime(),
    };
    reportRun_("success", summary);
    console.log(JSON.stringify(summary));
    return summary;
  } catch (error) {
    const summary = { durationMs: new Date().getTime() - startedAt.getTime(), error: String(error).slice(0, 300) };
    try { reportRun_("failed", summary); } catch (reportError) { console.error(String(reportError)); }
    throw error;
  }
}

function installFifteenMinuteTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "syncOwlNestOrders")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("syncOwlNestOrders").timeBased().everyMinutes(15).create();
  return syncOwlNestOrders();
}

// Read-only setup diagnostic. It logs only the executing account and thread
// counts; it never logs subjects, message bodies, guest names, or addresses.
function diagnoseGmailAccess() {
  const result = {
    activeUser: Session.getActiveUser().getEmail() || "unavailable",
    effectiveUser: Session.getEffectiveUser().getEmail() || "unavailable",
    recentThreads: GmailApp.search("in:anywhere newer_than:30d", 0, 10).length,
    owltingThreads: GmailApp.search("in:anywhere newer_than:365d owlting", 0, 100).length,
  };
  console.log(JSON.stringify(result));
  return result;
}

function postJson_(path, payload) {
  const properties = PropertiesService.getScriptProperties();
  const siteUrl = properties.getProperty("OPS_SITE_URL");
  const bypassToken = properties.getProperty("OPS_SITE_BYPASS_TOKEN");
  if (!siteUrl || !bypassToken) throw new Error("尚未設定 OPS_SITE_URL 或 OPS_SITE_BYPASS_TOKEN");
  const response = UrlFetchApp.fetch(siteUrl.replace(/\/$/, "") + path, {
    method: "post",
    contentType: "application/json",
    headers: { "OAI-Sites-Authorization": "Bearer " + bypassToken },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  const raw = response.getContentText();
  let body;
  try { body = JSON.parse(raw); } catch (_) { throw new Error("工作台未回傳 JSON（HTTP " + status + ")"); }
  if (status >= 400) throw new Error(body.error || "工作台回傳 HTTP " + status);
  return body;
}

function reportRun_(status, summary) {
  return postJson_("/api/automation-runs", { jobId: JOB_ID, status, summary });
}
