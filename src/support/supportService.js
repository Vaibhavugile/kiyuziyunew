
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  onSnapshot,
} from 'firebase/firestore';

import {
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';

export const createSupportService = ({ db, storage }) => {
  const ticketsRef = collection(db, 'supportTickets');

  const STAFF_ROLES = [
    'superadmin',
    'manager',
    'sales',
    'admin',
    'support',
  ];

  const isStaffRole = (role) =>
    STAFF_ROLES.includes(String(role || '').toLowerCase());

  // Upload an attachment to Firebase Storage.
  const uploadAttachment = async ({ uid, ticketId, file }) => {
    if (!storage) {
      throw new Error('Firebase Storage is not configured.');
    }

    if (!file) return null;

    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Attachments must be smaller than 10 MB.');
    }

    if (
      !file.type.startsWith('image/') &&
      file.type !== 'application/pdf'
    ) {
      throw new Error('Only images and PDF files are allowed.');
    }

    const safeName = file.name
      .replace(/[^\w.\-]/g, '_')
      .slice(0, 100);

    const path =
      `supportAttachments/${uid}/${ticketId}/` +
      `${Date.now()}_${safeName}`;

    const fileRef = ref(storage, path);

    await uploadBytes(fileRef, file, {
      contentType: file.type || 'application/octet-stream',
      customMetadata: {
        ownerUid: uid,
        ticketId,
      },
    });

    return {
      name: file.name,
      path,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      url: await getDownloadURL(fileRef),
    };
  };

  // Fetch and validate the selected customer's order.
  const getValidatedOrder = async (uid, orderId) => {
    const cleanOrderId = String(orderId || '').trim().slice(0, 120);

    if (!cleanOrderId) return null;

    const orderSnap = await getDoc(
      doc(db, 'orders', cleanOrderId)
    );

    if (!orderSnap.exists()) {
      throw new Error(
        'Order not found. Please select one of your recent orders.'
      );
    }

    const order = orderSnap.data();

    if (order.userId !== uid) {
      throw new Error(
        'This order does not belong to your account.'
      );
    }

    return {
      orderId: cleanOrderId,
      orderAmount: Number(
        order.totalAmount ??
        order.total ??
        order.grandTotal ??
        0
      ),
      orderStatus: String(order.status || 'processing'),
      orderDisplayId: String(
        order.orderNumber ||
        order.orderId ||
        cleanOrderId
      ),
    };
  };

  // Create a new customer support ticket.
  const createTicket = async ({
    uid,
    displayName,
    subject,
    message,
    orderId = '',
    selectedOrder = null,
    attachment = null,
  }) => {
    if (!uid) {
      throw new Error('Please sign in to contact support.');
    }

    const cleanSubject = String(subject || '').trim().slice(0, 140);
    const cleanMessage = String(message || '').trim().slice(0, 5000);

    if (!cleanSubject) {
      throw new Error('Please select or enter a support subject.');
    }

    if (!cleanMessage && !attachment) {
      throw new Error(
        'Please enter a message or attach a file.'
      );
    }

    // Use the explicit order ID first, then the selected order.
    const selectedOrderId =
      String(orderId || '').trim() ||
      String(selectedOrder?.id || '').trim();

    const orderSummary = selectedOrderId
      ? await getValidatedOrder(uid, selectedOrderId)
      : null;

    const ticket = await addDoc(ticketsRef, {
      customerUid: uid,
      customerName: String(displayName || 'Customer').slice(0, 120),

      subject: cleanSubject,

      orderId: orderSummary?.orderId || '',
      ...(orderSummary || {}),

      status: 'open',
      assignedTo: null,
      assignedName: null,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),

      lastMessagePreview: (
        cleanMessage || 'Attachment sent'
      ).slice(0, 180),

      customerUnread: 0,
      staffUnread: 1,
      messageCount: 1,
    });

    try {
      const attachmentData = attachment
        ? await uploadAttachment({
            uid,
            ticketId: ticket.id,
            file: attachment,
          })
        : null;

      await addDoc(
        collection(db, 'supportTickets', ticket.id, 'messages'),
        {
          senderUid: uid,
          senderRole: 'customer',
          text: cleanMessage,
          attachment: attachmentData,
          createdAt: serverTimestamp(),
        }
      );

      return ticket.id;
    } catch (error) {
      // The ticket may already exist if an upload or message write fails.
      // Keep the original error so the UI can display it.
      throw error;
    }
  };

  // Send a message to an existing support conversation.
  const sendMessage = async ({
    uid,
    role,
    ticketId,
    text,
    file = null,
  }) => {
    if (!uid || !ticketId) {
      throw new Error('A signed-in user and ticket are required.');
    }

    const cleanText = String(text || '').trim().slice(0, 5000);

    if (!cleanText && !file) {
      throw new Error('Write a message or attach a file.');
    }

    const ticketRef = doc(db, 'supportTickets', ticketId);
    const ticketSnap = await getDoc(ticketRef);

    if (!ticketSnap.exists()) {
      throw new Error('This conversation no longer exists.');
    }

    const ticket = ticketSnap.data();
    const isStaff = isStaffRole(role);

    if (!isStaff && ticket.customerUid !== uid) {
      throw new Error('You cannot access this conversation.');
    }

    const attachment = file
      ? await uploadAttachment({
          uid,
          ticketId,
          file,
        })
      : null;

    await addDoc(
      collection(db, 'supportTickets', ticketId, 'messages'),
      {
        senderUid: uid,
        senderRole: isStaff
          ? String(role).toLowerCase()
          : 'customer',
        text: cleanText,
        attachment,
        createdAt: serverTimestamp(),
      }
    );

    const isReopening =
      !isStaff && ticket.status === 'closed';

    await updateDoc(ticketRef, {
      updatedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),

      lastMessagePreview: (
        cleanText || `Attachment: ${file?.name || 'file'}`
      ).slice(0, 180),

      messageCount: (ticket.messageCount || 0) + 1,

      ...(isStaff
        ? {
            customerUnread: (ticket.customerUnread || 0) + 1,
            staffUnread: 0,
          }
        : {
            staffUnread: (ticket.staffUnread || 0) + 1,
            customerUnread: 0,
          }),

      ...(isReopening ? { status: 'open' } : {}),

      ...(
        !isStaff && ticket.status === 'waiting_customer'
          ? { status: 'in_progress' }
          : {}
      ),
    });
  };

  // Real-time listener: fetch the customer's latest five orders.
  const subscribeToRecentOrders = (uid, callback, onError) => {
    if (!uid) {
      callback([]);
      return () => {};
    }

    const ordersQuery = query(
      collection(db, 'orders'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    return onSnapshot(
      ordersQuery,
      (snapshot) => {
        const orders = snapshot.docs.map((orderDoc) => ({
          id: orderDoc.id,
          ...orderDoc.data(),
        }));

        callback(orders);
      },
      onError
    );
  };

  // Real-time listener: customer's support tickets.
  const subscribeToCustomerTickets = (
    uid,
    callback,
    onError
  ) => {
    if (!uid) {
      callback([]);
      return () => {};
    }

    const ticketsQuery = query(
      ticketsRef,
      where('customerUid', '==', uid),
      orderBy('lastMessageAt', 'desc'),
      limit(50)
    );

    return onSnapshot(
      ticketsQuery,
      (snapshot) => {
        callback(
          snapshot.docs.map((ticketDoc) => ({
            id: ticketDoc.id,
            ...ticketDoc.data(),
          }))
        );
      },
      onError
    );
  };

  // Real-time listener: staff support inbox.
  const subscribeToStaffTickets = (callback, onError) => {
    const ticketsQuery = query(
      ticketsRef,
      orderBy('lastMessageAt', 'desc'),
      limit(100)
    );

    return onSnapshot(
      ticketsQuery,
      (snapshot) => {
        callback(
          snapshot.docs.map((ticketDoc) => ({
            id: ticketDoc.id,
            ...ticketDoc.data(),
          }))
        );
      },
      onError
    );
  };

  // Real-time listener: messages in a conversation.
  const subscribeToMessages = (
    ticketId,
    callback,
    onError
  ) => {
    const messagesQuery = query(
      collection(db, 'supportTickets', ticketId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(300)
    );

    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        callback(
          snapshot.docs.map((messageDoc) => ({
            id: messageDoc.id,
            ...messageDoc.data(),
          }))
        );
      },
      onError
    );
  };

  // Update ticket status.
  const updateTicketStatus = async (ticketId, status) => {
    const allowedStatuses = [
      'open',
      'in_progress',
      'waiting_customer',
      'closed',
    ];

    if (!allowedStatuses.includes(status)) {
      throw new Error('Invalid ticket status.');
    }

    await updateDoc(
      doc(db, 'supportTickets', ticketId),
      {
        status,
        updatedAt: serverTimestamp(),
      }
    );
  };

  // Assign a ticket to a staff member.
  const assignTicket = async (
    ticketId,
    staffUid,
    staffName
  ) => {
    await updateDoc(
      doc(db, 'supportTickets', ticketId),
      {
        assignedTo: staffUid || null,
        assignedName: staffUid
          ? (staffName || 'Support agent')
          : null,
        updatedAt: serverTimestamp(),
      }
    );
  };

  // Clear unread count for the relevant side.
  const markRead = async (ticketId, role) => {
    const isCustomer = role === 'customer';

    await updateDoc(
      doc(db, 'supportTickets', ticketId),
      isCustomer
        ? { customerUnread: 0 }
        : { staffUnread: 0 }
    );
  };

  return {
    createTicket,
    sendMessage,
    subscribeToRecentOrders,
    subscribeToCustomerTickets,
    subscribeToStaffTickets,
    subscribeToMessages,
    updateTicketStatus,
    assignTicket,
    markRead,
  };
};
