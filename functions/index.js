const {
  onDocumentUpdated,
  onDocumentCreated,
} = require("firebase-functions/v2/firestore");

const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

////////////////////////////////////////////////////////////
/// GET CUSTOMER FCM TOKEN
////////////////////////////////////////////////////////////

async function getCustomerToken(customerUid) {
  if (!customerUid) {
    console.log("❌ Customer UID is missing.");
    return null;
  }

  console.log(
    `🔍 Looking for customer: ${customerUid}`
  );

  const userSnap = await db
    .collection("appUsers")
    .doc(customerUid)
    .get();

  if (!userSnap.exists) {
    console.log(
      `❌ Appuser not found: ${customerUid}`
    );

    return null;
  }

  const userData =
    userSnap.data() || {};

  const token =
    userData.fcmToken;

  if (
    typeof token !== "string" ||
    token.trim().length === 0
  ) {
    console.log(
      `❌ No FCM token found for customer: ${customerUid}`
    );

    return null;
  }

  console.log(
    `✅ Customer FCM token found.`
  );

  return token.trim();
}

////////////////////////////////////////////////////////////
/// 1. CUSTOMER NOTIFICATION
///    WHEN ORDER STATUS CHANGES
////////////////////////////////////////////////////////////

exports.notifyCustomerOrderStatus =
  onDocumentUpdated(
    {
      document: "orderChats/{orderId}",
      region: "asia-south1",
    },

    async (event) => {
      ////////////////////////////////////////////////////////
      /// SAFETY CHECK
      ////////////////////////////////////////////////////////

      if (!event.data) {
        console.log(
          "❌ Event data is missing."
        );

        return;
      }

      ////////////////////////////////////////////////////////
      /// BEFORE / AFTER
      ////////////////////////////////////////////////////////

      const before =
        event.data.before.data() || {};

      const after =
        event.data.after.data() || {};

      const orderId =
        event.params.orderId;

      ////////////////////////////////////////////////////////
      /// OLD / NEW STATUS
      ////////////////////////////////////////////////////////

      const oldStatus =
        before.orderStatus;

      const newStatus =
        after.orderStatus;

      console.log(
        "======================================"
      );

      console.log(
        "🔔 ORDER STATUS CHANGE"
      );

      console.log(
        `Order ID   : ${orderId}`
      );

      console.log(
        `Old Status : ${oldStatus}`
      );

      console.log(
        `New Status : ${newStatus}`
      );

      console.log(
        "======================================"
      );

      ////////////////////////////////////////////////////////
      /// STATUS DID NOT CHANGE
      ////////////////////////////////////////////////////////

      if (oldStatus === newStatus) {
        console.log(
          "ℹ️ Order status did not change."
        );

        return;
      }

      ////////////////////////////////////////////////////////
      /// CUSTOMER UID
      ///
      /// We support these possible fields:
      /// customerUid
      /// userId
      /// uid
      ////////////////////////////////////////////////////////

      const customerUid =
            orderChat.customerId;

      if (!customerUid) {
        console.log(
          `❌ Customer UID missing for order ${orderId}`
        );

        return;
      }

      console.log(
        `👤 Customer UID: ${customerUid}`
      );

      ////////////////////////////////////////////////////////
      /// GET CUSTOMER TOKEN
      ////////////////////////////////////////////////////////

      const token =
        await getCustomerToken(
          customerUid
        );

      if (!token) {
        console.log(
          "❌ Customer token unavailable."
        );

        return;
      }

      ////////////////////////////////////////////////////////
      /// STATUS TEXT
      ////////////////////////////////////////////////////////

      const statusText =
        String(
          newStatus || "Updated"
        );

      ////////////////////////////////////////////////////////
      /// SEND NOTIFICATION
      ////////////////////////////////////////////////////////

      try {
        const response =
          await messaging.send({
            token: token,

            notification: {
              title: "Order Update",
              body:
                `Your order status is now ${statusText}.`,
            },

            data: {
              type: "order_status",
              orderId:
                String(orderId),
              orderStatus:
                statusText,
            },

            android: {
              priority: "high",

              notification: {
                channelId:
                  "orders",
                sound:
                  "default",
              },
            },
          });

        console.log(
          "✅ Customer order status notification sent."
        );

        console.log(
          `FCM Response: ${response}`
        );
      } catch (error) {
        console.error(
          "❌ Failed to send order status notification:"
        );

        console.error(error);

        //////////////////////////////////////////////////////
        /// INVALID TOKEN
        //////////////////////////////////////////////////////

        if (
          error.code ===
            "messaging/registration-token-not-registered" ||
          error.code ===
            "messaging/invalid-registration-token"
        ) {
          try {
            await db
              .collection("appUsers")
              .doc(customerUid)
              .update({
                fcmToken:
                  admin.firestore.FieldValue.delete(),
              });

            console.log(
              "🗑️ Invalid FCM token removed."
            );
          } catch (deleteError) {
            console.error(
              "❌ Failed to remove invalid token:",
              deleteError
            );
          }
        }
      }
    }
  );

////////////////////////////////////////////////////////////
/// 2. CUSTOMER NOTIFICATION
///    WHEN NEW CHAT MESSAGE IS CREATED
////////////////////////////////////////////////////////////

exports.notifyCustomerNewMessage =
  onDocumentCreated(
    {
      document:
        "orderChats/{orderId}/messages/{messageId}",

      region: "asia-south1",
    },

    async (event) => {
      ////////////////////////////////////////////////////////
      /// SAFETY CHECK
      ////////////////////////////////////////////////////////

      if (!event.data) {
        console.log(
          "❌ Message event data missing."
        );

        return;
      }

      ////////////////////////////////////////////////////////
      /// MESSAGE DATA
      ////////////////////////////////////////////////////////

      const messageData =
        event.data.data() || {};

      const orderId =
        event.params.orderId;

      const messageId =
        event.params.messageId;

      console.log(
        "======================================"
      );

      console.log(
        "💬 NEW ORDER CHAT MESSAGE"
      );

      console.log(
        `Order ID   : ${orderId}`
      );

      console.log(
        `Message ID : ${messageId}`
      );

      console.log(
        "======================================"
      );

      ////////////////////////////////////////////////////////
      /// GET ORDER CHAT
      ////////////////////////////////////////////////////////

      const orderChatSnap =
        await db
          .collection("orderChats")
          .doc(orderId)
          .get();

      if (!orderChatSnap.exists) {
        console.log(
          `❌ Order chat not found: ${orderId}`
        );

        return;
      }

      const orderChat =
        orderChatSnap.data() || {};

      ////////////////////////////////////////////////////////
      /// CUSTOMER UID
      ////////////////////////////////////////////////////////

      const customerUid =
            orderChat.customerId;

      if (!customerUid) {
        console.log(
          `❌ Customer UID missing in orderChats/${orderId}`
        );

        return;
      }

      console.log(
        `👤 Customer UID: ${customerUid}`
      );

      ////////////////////////////////////////////////////////
      /// MESSAGE SENDER
      ////////////////////////////////////////////////////////

      const senderUid =
        messageData.senderUid ||
        messageData.userId ||
        messageData.uid ||
        messageData.createdBy;

      console.log(
        `Message sender: ${senderUid || "unknown"}`
      );

      ////////////////////////////////////////////////////////
      /// DO NOT NOTIFY CUSTOMER
      /// ABOUT THEIR OWN MESSAGE
      ////////////////////////////////////////////////////////

      if (
        senderUid &&
        senderUid === customerUid
      ) {
        console.log(
          "ℹ️ Customer sent this message."
        );

        console.log(
          "ℹ️ Notification skipped."
        );

        return;
      }

      ////////////////////////////////////////////////////////
      /// GET CUSTOMER TOKEN
      ////////////////////////////////////////////////////////

      const token =
        await getCustomerToken(
          customerUid
        );

      if (!token) {
        console.log(
          "❌ Customer FCM token unavailable."
        );

        return;
      }

      ////////////////////////////////////////////////////////
      /// MESSAGE TEXT
      ////////////////////////////////////////////////////////

      let messageText =
        messageData.text ||
        messageData.message ||
        messageData.content;

      if (
        !messageText ||
        String(messageText).trim().length === 0
      ) {
        messageText =
          "You have a new message.";
      }

      messageText =
        String(messageText);

      ////////////////////////////////////////////////////////
      /// SEND NOTIFICATION
      ////////////////////////////////////////////////////////

      try {
        const response =
          await messaging.send({
            token: token,

            notification: {
              title: "New Message",
              body: messageText,
            },

            data: {
              type:
                "order_message",

              orderId:
                String(orderId),

              messageId:
                String(messageId),
            },

            android: {
              priority: "high",

              notification: {
                channelId:
                  "messages",
                sound:
                  "default",
              },
            },
          });

        console.log(
          "✅ Customer message notification sent."
        );

        console.log(
          `FCM Response: ${response}`
        );
      } catch (error) {
        console.error(
          "❌ Failed to send message notification:"
        );

        console.error(error);

        //////////////////////////////////////////////////////
        /// INVALID TOKEN
        //////////////////////////////////////////////////////

        if (
          error.code ===
            "messaging/registration-token-not-registered" ||
          error.code ===
            "messaging/invalid-registration-token"
        ) {
          try {
            await db
              .collection("appUsers")
              .doc(customerUid)
              .update({
                fcmToken:
                  admin.firestore.FieldValue.delete(),
              });

            console.log(
              "🗑️ Invalid customer FCM token removed."
            );
          } catch (deleteError) {
            console.error(
              "❌ Failed to remove invalid token:",
              deleteError
            );
          }
        }
      }
    }
  );

////////////////////////////////////////////////////////////
// SUPPORT TICKET PUSH NOTIFICATIONS
// Customer message -> assigned staff, or superadmin fallback
// Staff reply -> ticket customer
////////////////////////////////////////////////////////////

const SUPPORT_NOTIFICATION_STAFF_ROLES = [
  "superadmin",
  "manager",
  "sales",
  "admin",
  "support",
];

exports.notifySupportTicketMessages = onDocumentCreated(
  {
    document: "supportTickets/{ticketId}/messages/{messageId}",
    region: "asia-south1",
  },
  async (event) => {
    try {
      if (!event.data) {
        console.log("Support notification: missing message event data.");
        return;
      }

      const message = event.data.data() || {};
      const { ticketId, messageId } = event.params;

      const ticketRef = db.collection("supportTickets").doc(ticketId);
      const ticketSnap = await ticketRef.get();

      if (!ticketSnap.exists) {
        console.log(`Support ticket not found: ${ticketId}`);
        return;
      }

      const ticket = ticketSnap.data() || {};
      const senderUid = String(message.senderUid || "");
      const senderRole = String(message.senderRole || "").toLowerCase();

      if (!senderUid) {
        console.log(`Message ${messageId} has no senderUid.`);
        return;
      }

      const messageText = String(
        message.text ||
        (message.attachment ? "Sent an attachment." : "Sent a message.")
      ).trim().slice(0, 500);

      let recipients = [];
      let title = "";
      let url = "/";

      // CUSTOMER -> assigned staff, or superadmin if unassigned.
      if (senderRole === "customer") {
        if (ticket.customerUid !== senderUid) {
          console.warn(
            `Customer sender does not match ticket owner: ${ticketId}`
          );
          return;
        }

        if (ticket.assignedTo) {
          recipients = [String(ticket.assignedTo)];
        } else {
          const staffSnap = await db
            .collection("users")
            .where("role", "==", "superadmin")
            .get();

          recipients = staffSnap.docs.map((doc) => doc.id);
        }

        title = `New support message: ${ticket.subject || "Support request"}`;
        url = "/";

      // STAFF -> customer who owns this ticket.
      } else if (SUPPORT_NOTIFICATION_STAFF_ROLES.includes(senderRole)) {
        if (!ticket.customerUid) {
          console.warn(`Ticket ${ticketId} has no customerUid.`);
          return;
        }

        recipients = [String(ticket.customerUid)];
        title = "Support replied to your message";
        url = "/";

      } else {
        console.log(
          `Unsupported sender role "${senderRole}" for ticket ${ticketId}.`
        );
        return;
      }

      // Never send a notification to the person who sent the message.
      recipients = [
        ...new Set(
          recipients.filter((uid) => uid && uid !== senderUid)
        ),
      ];

      if (!recipients.length) {
        console.log(`No notification recipients for ticket ${ticketId}.`);
        return;
      }

      let sentCount = 0;
      let failedCount = 0;

      for (const recipientUid of recipients) {
        const devicesSnap = await db
          .collection("users")
          .doc(recipientUid)
          .collection("notificationDevices")
          .get();

        for (const deviceDoc of devicesSnap.docs) {
          const device = deviceDoc.data() || {};
          const token = String(device.token || "").trim();

          if (!token || device.enabled === false) {
            continue;
          }

          try {
            await messaging.send({
              token,

              // Data-only payload: the website service worker displays
              // the notification using data.title, data.body and data.url.
              data: {
                title,
                body: messageText || "You have a new support message.",
                url,
                type: "support_message",
                ticketId: String(ticketId),
                messageId: String(messageId),
              },

              webpush: {
                headers: {
                  Urgency: "high",
                },
              },
            });

            sentCount++;
          } catch (error) {
            failedCount++;

            console.error(
              `Push failed for recipient ${recipientUid}, device ${deviceDoc.id}:`,
              error.code || error.message
            );

            // Remove only tokens Firebase confirms are invalid.
            if (
              error.code ===
                "messaging/registration-token-not-registered" ||
              error.code === "messaging/invalid-registration-token"
            ) {
              await deviceDoc.ref.delete().catch((deleteError) => {
                console.error(
                  "Could not delete invalid notification device:",
                  deleteError.message
                );
              });
            }
          }
        }
      }

      console.log(
        `Support push complete. Ticket=${ticketId}, ` +
        `sent=${sentCount}, failed=${failedCount}`
      );
    } catch (error) {
      console.error(
        "Support ticket notification function failed:",
        error
      );
      throw error;
    }
  }
);
