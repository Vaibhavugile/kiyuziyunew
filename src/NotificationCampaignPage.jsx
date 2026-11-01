import React, { useEffect, useMemo, useState } from "react";
import {
  collection, getDocs
} from "firebase/firestore";
import {
  getDownloadURL, ref, uploadBytes
} from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, storage, auth } from "./firebase";
import "./NotificationCampaignPage.css";

const ROLE_FIELDS = ["role", "userRole", "accountType", "customerRole", "customerType"];
const PHONE_FIELDS = ["phoneNumber", "phone", "mobileNumber", "mobile", "whatsappNumber"];
const NAME_FIELDS = ["name", "fullName", "displayName", "firstName"];
const EMAIL_FIELDS = ["email", "emailAddress"];

function firstValue(data, fields) {
  for (const field of fields) {
    const value = data?.[field];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}
function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").replace(/^0+/, "");
}
function userLabel(user) {
  return user.name || user.phone || user.email || user.id;
}

export default function NotificationCampaignPage() {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [clickUrl, setClickUrl] = useState("");
  const [audience, setAudience] = useState("all");
  const [role, setRole] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [testPhone, setTestPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("compose");

  const functions = useMemo(() => getFunctions(undefined, "asia-south1"), []);
  const sendCampaign = useMemo(() => httpsCallable(functions, "sendNotificationCampaign"), [functions]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingUsers(true);
        const snap = await getDocs(collection(db, "users"));
        const rows = snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            name: firstValue(data, NAME_FIELDS),
            phone: firstValue(data, PHONE_FIELDS),
            email: firstValue(data, EMAIL_FIELDS),
            role: firstValue(data, ROLE_FIELDS),
            raw: data
          };
        });
        if (alive) setUsers(rows);
      } catch (e) {
        if (alive) setLoadError(e.message || "Could not load users. Check Firestore read permissions.");
      } finally {
        if (alive) setLoadingUsers(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const roles = useMemo(() => [...new Set(users.map(u => u.role).filter(Boolean))].sort(), [users]);
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => !q || [u.name, u.phone, u.email, u.id, u.role].some(v => String(v || "").toLowerCase().includes(q)));
  }, [users, search]);

  const estimatedAudience = useMemo(() => {
    if (audience === "all") return users.length;
    if (audience === "role") return users.filter(u => u.role.toLowerCase() === role.toLowerCase()).length;
    if (audience === "phone") {
      const nums = phoneInput.split(/[\n,;]+/).map(normalizePhone).filter(Boolean);
      return users.filter(u => nums.includes(normalizePhone(u.phone))).length;
    }
    return selectedIds.length;
  }, [users, audience, role, phoneInput, selectedIds]);

  const toggleUser = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectVisible = () => setSelectedIds(prev => [...new Set([...prev, ...filteredUsers.map(u => u.id)])]);
  const clearSelected = () => setSelectedIds([]);

  async function uploadImageIfNeeded() {
    if (!imageFile) return imageUrl.trim();
    const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const imageRef = ref(storage, `notification-campaigns/${Date.now()}-${safeName}`);
    await uploadBytes(imageRef, imageFile, { contentType: imageFile.type });
    return getDownloadURL(imageRef);
  }

  function audiencePayload() {
    if (audience === "role") return { type: "role", role };
    if (audience === "phone") return { type: "phone", phoneNumbers: phoneInput.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean) };
    if (audience === "selected") return { type: "selected", userIds: selectedIds };
    return { type: "all" };
  }

  async function submitCampaign(testOnly = false) {
    setStatus(null);
    if (!title.trim() || !body.trim()) return setStatus({ type: "error", message: "Enter both notification title and message." });
    if (audience === "role" && !role) return setStatus({ type: "error", message: "Choose a role." });
    if (audience === "phone" && !phoneInput.trim()) return setStatus({ type: "error", message: "Enter at least one mobile number." });
    if (audience === "selected" && !selectedIds.length) return setStatus({ type: "error", message: "Select at least one user." });
    if (testOnly && !testPhone.trim()) return setStatus({ type: "error", message: "Enter a mobile number for the test." });

    try {
      setBusy(true);
      let finalImageUrl = await uploadImageIfNeeded();
      const result = await sendCampaign({
        title: title.trim(),
        body: body.trim(),
        imageUrl: finalImageUrl || "",
        clickUrl: clickUrl.trim(),
        audience: testOnly
          ? { type: "phone", phoneNumbers: [testPhone.trim()] }
          : audiencePayload(),
        testOnly
      });
      const data = result.data || {};
      setStatus({
        type: "success",
        message: testOnly
          ? `Test notification request completed. Sent: ${data.sent || 0}, failed: ${data.failed || 0}.`
          : `Campaign completed. Sent: ${data.sent || 0}, failed: ${data.failed || 0}, devices targeted: ${data.targeted || 0}.`
      });
      if (!testOnly) setHistory(prev => [{ id: data.campaignId || Date.now(), title, sent: data.sent || 0, failed: data.failed || 0, targeted: data.targeted || 0, time: new Date() }, ...prev]);
    } catch (e) {
      setStatus({ type: "error", message: e.message || "Notification could not be sent." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ncp">
      <header className="ncp-header">
        <div><span className="ncp-eyebrow">CUSTOMER ENGAGEMENT</span><h1>Notification Campaigns</h1><p>Create and send customized push notifications to your customers.</p></div>
        <div className="ncp-header-stat"><strong>{users.length.toLocaleString()}</strong><span>Users loaded</span></div>
      </header>

      <nav className="ncp-tabs">
        <button className={activeTab === "compose" ? "active" : ""} onClick={() => setActiveTab("compose")}>Create campaign</button>
        <button className={activeTab === "history" ? "active" : ""} onClick={() => setActiveTab("history")}>Session history</button>
      </nav>

      {activeTab === "compose" ? (
        <div className="ncp-grid">
          <main className="ncp-main">
            <section className="ncp-card">
              <div className="ncp-section-head"><div><h2>Notification content</h2><p>Customize what customers see on their devices.</p></div><span className="ncp-step">01</span></div>
              <label>Notification title<input maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. New arrivals are here!" /></label>
              <label>Message / subtitle<textarea maxLength={500} rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Write a short, clear message for your customers..." /></label>
              <div className="ncp-two">
                <label>Notification image<input type="file" accept="image/*" onChange={e => { setImageFile(e.target.files?.[0] || null); if (e.target.files?.[0]) setImageUrl(""); }} /></label>
                <label>Or paste image URL<input value={imageUrl} onChange={e => { setImageUrl(e.target.value); setImageFile(null); }} placeholder="https://..." /></label>
              </div>
              {imageFile && <div className="ncp-file">Selected: {imageFile.name} <button onClick={() => setImageFile(null)}>Remove</button></div>}
              <label>Click destination URL <span className="ncp-optional">Optional</span><input value={clickUrl} onChange={e => setClickUrl(e.target.value)} placeholder="https://yourstore.com/collection/new" /></label>
            </section>

            <section className="ncp-card">
              <div className="ncp-section-head"><div><h2>Choose audience</h2><p>Target all customers or narrow the recipient list.</p></div><span className="ncp-step">02</span></div>
              <div className="ncp-audience-grid">
                {[["all","All users","Every user with at least one enabled notification device"],["role","By role","Retailer, wholesaler, distributor, VIP and more"],["phone","Mobile numbers","Enter one or multiple mobile numbers"],["selected","Select users","Find customers and select them individually"]].map(([v,t,d]) => (
                  <button key={v} className={`ncp-audience ${audience === v ? "chosen" : ""}`} onClick={() => setAudience(v)}><span className="ncp-radio">{audience === v ? "●" : "○"}</span><strong>{t}</strong><small>{d}</small></button>
                ))}
              </div>
              {audience === "role" && <label>Choose role<select value={role} onChange={e => setRole(e.target.value)}><option value="">Select role</option>{roles.map(r => <option key={r} value={r}>{r}</option>)}</select><small className="ncp-hint">Roles are detected from role, userRole, accountType, customerRole or customerType fields.</small></label>}
              {audience === "phone" && <label>Mobile numbers<textarea rows={4} value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder={"9876543210\n919876543210\nSeparate numbers with commas or new lines"} /><small className="ncp-hint">Phone matching ignores spaces, +, hyphens and leading zeroes.</small></label>}
              {audience === "selected" && <div className="ncp-user-picker">
                <div className="ncp-picker-tools"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, mobile, email, role or user ID..." /><button onClick={selectVisible}>Select visible</button><button className="ncp-quiet" onClick={clearSelected}>Clear</button></div>
                <div className="ncp-user-list">{loadingUsers ? <p>Loading users…</p> : filteredUsers.slice(0, 250).map(u => <label className="ncp-user-row" key={u.id}><input type="checkbox" checked={selectedIds.includes(u.id)} onChange={() => toggleUser(u.id)} /><span><strong>{userLabel(u)}</strong><small>{[u.phone, u.email, u.role].filter(Boolean).join(" · ") || u.id}</small></span></label>)}</div>
                <small className="ncp-hint">Showing up to 250 matching users. Selected: {selectedIds.length}</small>
              </div>}
              <div className="ncp-estimate"><span>Estimated user matches</span><strong>{estimatedAudience.toLocaleString()}</strong><small>Actual recipients depend on enabled devices and valid FCM tokens.</small></div>
            </section>

            <section className="ncp-card">
              <div className="ncp-section-head"><div><h2>Send options</h2><p>Test the message before sending it to the selected audience.</p></div><span className="ncp-step">03</span></div>
              <label>Test recipient mobile number<input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="Enter a registered customer's mobile number" /></label>
              <div className="ncp-actions"><button className="ncp-test" disabled={busy} onClick={() => submitCampaign(true)}>Send test</button><button className="ncp-send" disabled={busy} onClick={() => submitCampaign(false)}>{busy ? "Sending…" : "Send notification campaign →"}</button></div>
              {status && <div className={`ncp-status ${status.type}`}>{status.message}</div>}
            </section>
          </main>

          <aside className="ncp-preview-col">
            <div className="ncp-preview-card">
              <div className="ncp-preview-top"><span>LIVE PREVIEW</span><span className="ncp-dot">●</span></div>
              <div className="ncp-phone">
                <div className="ncp-phone-status"><span>9:41</span><span>●●● ▰</span></div>
                <div className="ncp-notification">
                  <div className="ncp-app-line"><span className="ncp-app-icon">S</span><strong>Your Store</strong><small>now</small></div>
                  {imageFile ? <div className="ncp-preview-image"><img src={URL.createObjectURL(imageFile)} alt="Notification preview" /></div> : imageUrl ? <div className="ncp-preview-image"><img src={imageUrl} alt="Notification preview" /></div> : null}
                  <strong className="ncp-preview-title">{title || "Your notification title"}</strong>
                  <p>{body || "Your notification message will appear here. Keep it short and useful."}</p>
                </div>
                <div className="ncp-phone-caption">Lock screen preview · Approximate</div>
              </div>
              <div className="ncp-preview-foot"><span>Audience</span><strong>{audience === "all" ? "All users" : audience === "role" ? (role || "Choose role") : audience === "phone" ? "Mobile numbers" : `${selectedIds.length} selected users`}</strong></div>
            </div>
            <div className="ncp-note"><strong>Delivery note</strong><p>Only enabled notification devices with valid FCM tokens can receive messages. A user may have multiple devices.</p></div>
          </aside>
        </div>
      ) : (
        <section className="ncp-card ncp-history"><h2>Campaigns sent in this session</h2><p>For permanent campaign history, the Cloud Function also saves records in Firestore under notificationCampaigns.</p>{history.length ? history.map(h => <div className="ncp-history-row" key={h.id}><div><strong>{h.title}</strong><small>{h.time.toLocaleString()}</small></div><span>{h.sent} sent</span><span>{h.failed} failed</span><span>{h.targeted} targeted</span></div>) : <div className="ncp-empty">No campaigns sent in this page session yet.</div>}</section>
      )}
      {loadError && <div className="ncp-load-error">{loadError}</div>}
      {loadingUsers && <div className="ncp-loading">Loading customer list…</div>}
    </div>
  );
}
