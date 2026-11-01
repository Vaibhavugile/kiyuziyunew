const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const logger = require("firebase-functions/logger");

initializeApp();

const db = getFirestore();
const REGION = "asia-south1";

const ROLE_FIELDS = ["role", "userRole", "accountType", "customerRole", "customerType"];
const PHONE_FIELDS = ["phoneNumber", "phone", "mobileNumber", "mobile", "whatsappNumber"];

function firstValue(data, fields) {
  for (const key of fields) {
    const value = data && data[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}
function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").replace(/^0+/, "");
}
function isAdminUser(data) {
  if (!data) return false;
  if (data.isAdmin === true || data.admin === true || data.isSuperAdmin === true) return true;
  const roles = [data.role, data.userRole, data.accountType, data.type]
    .filter(Boolean).map(v => String(v).toLowerCase());
  return roles.some(v => ["admin", "superadmin", "super_admin"].includes(v));
}
async function assertAdmin(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in with an admin account first.");
  }
  const uid = request.auth.uid;
  const allowed = (process.env.ADMIN_UIDS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (allowed.includes(uid)) return uid;

  const snap = await db.collection("users").doc(uid).get();
  if (isAdminUser(snap.exists ? snap.data() : null)) return uid;

  throw new HttpsError(
    "permission-denied",
    "This account is not authorized to send notification campaigns. Add its UID to ADMIN_UIDS or mark its user document as an admin."
  );
}
function validatePayload(data) {
  const title = String(data?.title || "").trim();
  const body = String(data?.body || "").trim();
  const imageUrl = String(data?.imageUrl || "").trim();
  const clickUrl = String(data?.clickUrl || "").trim();
  if (!title || !body) throw new HttpsError("invalid-argument", "Title and message are required.");
  if (title.length > 120 || body.length > 500) throw new HttpsError("invalid-argument", "Title or message is too long.");
  if (imageUrl && !/^https:\/\/.+/i.test(imageUrl)) throw new HttpsError("invalid-argument", "Image URL must use HTTPS.");
  if (clickUrl && !/^https:\/\/.+/i.test(clickUrl)) throw new HttpsError("invalid-argument", "Destination URL must use HTTPS.");
  const audience = data.audience || {};
  const type = audience.type;
  if (!["all", "role", "phone", "selected"].includes(type)) throw new HttpsError("invalid-argument", "Invalid audience type.");
  if (type === "role" && !String(audience.role || "").trim()) throw new HttpsError("invalid-argument", "Choose a role.");
  if (type === "phone" && (!Array.isArray(audience.phoneNumbers) || !audience.phoneNumbers.length)) throw new HttpsError("invalid-argument", "Enter mobile numbers.");
  if (type === "selected" && (!Array.isArray(audience.userIds) || !audience.userIds.length)) throw new HttpsError("invalid-argument", "Select users.");
  return { title, body, imageUrl, clickUrl, audience, testOnly: data.testOnly === true };
}
async function resolveUsers(audience) {
  const usersSnap = await db.collection("users").get();
  const all = usersSnap.docs.map(doc => ({ id: doc.id, data: doc.data() || {} }));
  if (audience.type === "all") return all;
  if (audience.type === "role") {
    const wanted = String(audience.role).trim().toLowerCase();
    return all.filter(u => firstValue(u.data, ROLE_FIELDS).toLowerCase() === wanted);
  }
  if (audience.type === "phone") {
    const wanted = new Set(audience.phoneNumbers.map(normalizePhone).filter(Boolean));
    return all.filter(u => wanted.has(normalizePhone(firstValue(u.data, PHONE_FIELDS))));
  }
  const ids = new Set(audience.userIds.map(String));
  return all.filter(u => ids.has(u.id));
}

exports.sendNotificationCampaign = onCall(
  { region: REGION, timeoutSeconds: 540, memory: "1GiB", maxInstances: 3 },
  async (request) => {
    const adminUid = await assertAdmin(request);
    const payload = validatePayload(request.data || {});
    const matchedUsers = await resolveUsers(payload.audience);
    if (!matchedUsers.length) {
      return { targeted: 0, sent: 0, failed: 0, usersMatched: 0, campaignId: null, message: "No matching users." };
    }

    const deviceRefs = [];
    const deviceTokenRecords = [];
    for (const user of matchedUsers) {
      const devicesSnap = await db.collection("users").doc(user.id)
        .collection("notificationDevices").where("enabled", "==", true).get();
      for (const deviceDoc of devicesSnap.docs) {
        const token = String(deviceDoc.data()?.token || "").trim();
        if (!token) continue;
        deviceRefs.push(deviceDoc.ref);
        deviceTokenRecords.push({ token, ref: deviceDoc.ref, userId: user.id });
      }
    }

    // Deduplicate tokens across customer/device records.
    const unique = new Map();
    for (const item of deviceTokenRecords) if (!unique.has(item.token)) unique.set(item.token, item);
    const recipients = [...unique.values()];
    if (!recipients.length) {
      return { targeted: 0, sent: 0, failed: 0, usersMatched: matchedUsers.length, campaignId: null, message: "No enabled devices with tokens were found." };
    }

    const campaignRef = payload.testOnly ? null : db.collection("notificationCampaigns").doc();
    let sent = 0;
    let failed = 0;
    let invalidTokens = 0;
    const messaging = getMessaging();

    for (let i = 0; i < recipients.length; i += 500) {
      const batch = recipients.slice(i, i + 500);
      const message = {
        tokens: batch.map(x => x.token),
        notification: {
          title: payload.title,
          body: payload.body,
          ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {})
        },
        data: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl || "",
          clickUrl: payload.clickUrl || "",
          campaign: campaignRef ? campaignRef.id : "test",
          type: "admin_campaign"
        },
        android: {
          priority: "high",
          notification: {
            ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
            ...(payload.clickUrl ? { clickAction: "FLUTTER_NOTIFICATION_CLICK" } : {})
          }
        },
        webpush: {
          headers: { Urgency: "high" },
          notification: {
            title: payload.title,
            body: payload.body,
            ...(payload.imageUrl ? { image: payload.imageUrl } : {}),
            ...(payload.clickUrl ? { click_action: payload.clickUrl } : {})
          },
          ...(payload.clickUrl ? { fcmOptions: { link: payload.clickUrl } } : {})
        },
        apns: {
          payload: { aps: { sound: "default" } },
          ...(payload.imageUrl ? { fcmOptions: { image: payload.imageUrl } } : {})
        }
      };

      const response = await messaging.sendEachForMulticast(message);
      response.responses.forEach((result, index) => {
        if (result.success) sent++;
        else {
          failed++;
          const code = result.error?.code || "";
          if ([
            "messaging/invalid-registration-token",
            "messaging/registration-token-not-registered"
          ].includes(code)) {
            invalidTokens++;
            // Remove unusable tokens from the device record.
            batch[index].ref.update({
              enabled: false,
              token: FieldValue.delete(),
              tokenInvalidatedAt: FieldValue.serverTimestamp()
            }).catch(err => logger.warn("Could not disable invalid token", err));
          }
        }
      });
    }

    if (campaignRef) {
      await campaignRef.set({
        title: payload.title,
        body: payload.body,
        imageUrl: payload.imageUrl || null,
        clickUrl: payload.clickUrl || null,
        audience: payload.audience,
        createdBy: adminUid,
        createdAt: FieldValue.serverTimestamp(),
        usersMatched: matchedUsers.length,
        targeted: recipients.length,
        sent,
        failed,
        invalidTokens,
        status: "completed"
      });
    }

    logger.info("Notification campaign processed", {
      adminUid, targeted: recipients.length, sent, failed, usersMatched: matchedUsers.length
    });

    return {
      campaignId: campaignRef?.id || null,
      usersMatched: matchedUsers.length,
      targeted: recipients.length,
      sent,
      failed,
      invalidTokens
    };
  }
);
