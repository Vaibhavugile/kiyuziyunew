const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const axios = require("axios");

const msg91Authkey = process.env.MSG91_AUTHKEY;
const yourMobileNumber = process.env.MSG91_MOBILE_NUMBER;

/* ================================
COMMON WHATSAPP SENDER FUNCTION
================================ */

async function sendWhatsApp(event) {
  try {
    if (!event.data) {
      logger.warn("No Firestore data found in event");
      return;
    }

    const orderData = event.data.data();

    if (!orderData) {
      logger.warn("Document exists but data is empty");
      return;
    }

    const orderId = event.params.orderId || "unknown";

    const totalAmount = Number(orderData.totalAmount || 0);

    logger.info("New Order Triggered", {
      orderId,
      totalAmount,
      collection: event.params,
    });

    const msg91ApiUrl =
      "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

    const payload = {
      integrated_number: "15558299861",
      content_type: "template",
      payload: {
        messaging_product: "whatsapp",
        type: "template",
        template: {
          name: "new_order_notification",
          language: {
            code: "en",
            policy: "deterministic",
          },
          namespace: "60cbb046_c34d_4f04_8c62_2cb720ccf00d",
          to_and_components: [
            {
              to: [yourMobileNumber],
              components: {
                body_1: {
                  type: "text",
                  value: orderId.substring(0, 8),
                },
                body_2: {
                  type: "text",
                  value: totalAmount.toFixed(2),
                },
              },
            },
          ],
        },
      },
    };

    logger.info("Sending WhatsApp notification via MSG91");

    const response = await axios.post(msg91ApiUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        authkey: msg91Authkey,
      },
    });

    logger.info("MSG91 Response", response.data);
  } catch (error) {
    logger.error(
      "WhatsApp notification failed",
      error.response?.data || error.message
    );
  }
}

/* ================================
ORDERS COLLECTION
================================ */

exports.sendWhatsAppNotification = onDocumentCreated(
  "orders/{orderId}",
  sendWhatsApp
);

/* ================================
STORE ORDERS COLLECTION
================================ */

exports.sendStoreWhatsAppNotification = onDocumentCreated(
  "storeOrders/{orderId}",
  sendWhatsApp
);