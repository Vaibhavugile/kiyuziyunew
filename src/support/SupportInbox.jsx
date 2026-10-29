
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaHeadset,
  FaSearch,
  FaPaperclip,
  FaPaperPlane,
  FaUserCheck,
  FaArrowLeft,
  FaUser,
  FaShoppingBag,
  FaTimes,
  FaFilePdf,
} from 'react-icons/fa';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { createSupportService } from './supportService';
import './support.css';

const STAFF_ROLES = [
  'superadmin',
  'manager',
  'sales',
  'admin',
  'support',
];

const isPlaceholderName = (name) => {
  const value = String(name || '').trim().toLowerCase();

  return !value || ['customer', 'unknown', 'n/a', 'null'].includes(value);
};

const getProfileName = (profile) =>
  profile?.displayName ||
  profile?.fullName ||
  profile?.name ||
  profile?.billingInfo?.fullName ||
  profile?.profile?.fullName ||
  '';

const formatDate = (value) => {
  if (!value) return 'Just now';

  try {
    const date = value?.toDate ? value.toDate() : new Date(value);

    return Number.isNaN(date.getTime())
      ? 'Just now'
      : date.toLocaleString();
  } catch {
    return 'Just now';
  }
};

const formatCurrency = (value) => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return '₹0.00';

  return amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const displayStatus = (status) =>
  String(status || 'open').replaceAll('_', ' ');

const getStaffDisplayName = (user, profile = {}) =>
  profile?.displayName ||
  profile?.fullName ||
  profile?.name ||
  profile?.email ||
  user?.displayName ||
  user?.email ||
  'Support staff';

export default function SupportInbox({
  db,
  storage,
  user,
  staffRole = '',
  staffProfile = {},
}) {
  const service = useMemo(
    () => createSupportService({ db, storage }),
    [db, storage]
  );

  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('open');
  const [assignUid, setAssignUid] = useState('');
  const [assignName, setAssignName] = useState('');
  const [busy, setBusy] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [error, setError] = useState('');
  const [customerNames, setCustomerNames] = useState({});

  // Avoid duplicate lookups while the inbox receives live updates.
  const nameRequests = useRef(new Set());
  const messagesRef = useRef(null);
  const composerRef = useRef(null);
  const fileInputRef = useRef(null);

  const normalizedRole = String(staffRole || '').toLowerCase();
  const authorized = STAFF_ROLES.includes(normalizedRole);
  const currentStaffName = getStaffDisplayName(user, staffProfile);

  // Load support tickets in real time.
  useEffect(() => {
    if (!authorized || !user?.uid) {
      setTickets([]);
      return undefined;
    }

    return service.subscribeToStaffTickets(
      setTickets,
      (err) => setError(err.message || 'Unable to load support tickets.')
    );
  }, [service, authorized, user?.uid]);

  // Subscribe to messages and show the logged-in staff member by default.
  // This only changes the displayed default; assignment is saved when
  // the staff member clicks "Assign to me".
  useEffect(() => {
    if (!selected?.id || !authorized || !user?.uid) {
      setMessages([]);
      return undefined;
    }

    setStatus(selected.status || 'open');
    setAssignUid(selected.assignedTo || user.uid);
    setAssignName(selected.assignedName || currentStaffName);

    service.markRead(selected.id, 'staff').catch(() => {});

    return service.subscribeToMessages(
      selected.id,
      setMessages,
      (err) => setError(err.message || 'Unable to load messages.')
    );
  }, [service, selected?.id, authorized, user?.uid, currentStaffName]);

  // Keep the latest message visible, like WhatsApp Web.
  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [selected?.id, messages.length]);

  // Synchronize selected ticket with live ticket updates.
  useEffect(() => {
    if (!selected?.id) return;

    const latest = tickets.find((ticket) => ticket.id === selected.id);

    if (latest) {
      setSelected((previous) => {
        if (!previous || previous.id !== latest.id) return previous;

        return { ...previous, ...latest };
      });
    }
  }, [tickets, selected?.id]);

  // Resolve missing or placeholder names from orders and customer profiles.
  useEffect(() => {
    if (!authorized || !db || !tickets.length) return undefined;

    let cancelled = false;

    const loadCustomerNames = async () => {
      const missingTickets = tickets.filter((ticket) => {
        const uid = ticket.customerUid;

        const hasTicketName =
          !isPlaceholderName(ticket.customerName) ||
          !isPlaceholderName(ticket.customerDisplayName) ||
          !isPlaceholderName(ticket.userName);

        return (
          uid &&
          !hasTicketName &&
          isPlaceholderName(customerNames[uid]) &&
          !nameRequests.current.has(uid)
        );
      });

      const uids = [
        ...new Set(missingTickets.map((ticket) => ticket.customerUid)),
      ];

      if (!uids.length) return;

      uids.forEach((uid) => nameRequests.current.add(uid));

      const results = await Promise.all(
        uids.map(async (uid) => {
          try {
            // 1. Check a linked order first. Your order schema stores
            // the name in billingInfo.fullName.
            const linkedTicket = missingTickets.find(
              (ticket) => ticket.customerUid === uid && ticket.orderId
            );

            if (linkedTicket?.orderId) {
              const orderSnap = await getDoc(
                doc(db, 'orders', linkedTicket.orderId)
              );

              if (orderSnap.exists()) {
                const order = orderSnap.data();
                const orderName = order.billingInfo?.fullName;

                if (
                  order.userId === uid &&
                  !isPlaceholderName(orderName)
                ) {
                  return [uid, orderName.trim()];
                }
              }
            }

            // 2. Check the customer profile.
            const profileSnap = await getDoc(doc(db, 'users', uid));

            if (profileSnap.exists()) {
              const profileName = getProfileName(profileSnap.data());

              if (!isPlaceholderName(profileName)) {
                return [uid, profileName.trim()];
              }
            }

            // 3. Fallback: check the customer's latest five orders.
            const recentOrdersQuery = query(
              collection(db, 'orders'),
              where('userId', '==', uid),
              orderBy('createdAt', 'desc'),
              limit(5)
            );

            const ordersSnap = await getDocs(recentOrdersQuery);

            for (const orderDoc of ordersSnap.docs) {
              const order = orderDoc.data();
              const orderName = order.billingInfo?.fullName;

              if (
                order.userId === uid &&
                !isPlaceholderName(orderName)
              ) {
                return [uid, orderName.trim()];
              }
            }

            return [uid, ''];
          } catch (err) {
            console.error(
              `Unable to resolve customer name for ${uid}:`,
              err.message
            );

            return [uid, ''];
          }
        })
      );

      if (!cancelled) {
        setCustomerNames((previous) => {
          const updated = { ...previous };

          results.forEach(([uid, name]) => {
            if (!isPlaceholderName(name)) {
              updated[uid] = name;
            }
          });

          return updated;
        });
      }
    };

    loadCustomerNames();

    return () => {
      cancelled = true;
    };
  }, [authorized, db, tickets, customerNames]);

  // Prefer a real saved name; otherwise use the fetched profile/order name.
  const getCustomerName = (ticket) => {
    const candidates = [
      ticket?.customerName,
      ticket?.customerDisplayName,
      ticket?.userName,
      customerNames[ticket?.customerUid],
    ];

    return candidates.find((name) => !isPlaceholderName(name)) || 'Customer';
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const matchesStatus =
        filter === 'all' || ticket.status === filter;

      const name = getCustomerName(ticket).toLowerCase();

      const searchable = [
        ticket.subject,
        name,
        ticket.customerUid,
        ticket.orderId,
        ticket.orderDisplayId,
        ticket.lastMessagePreview,
      ];

      const matchesSearch =
        !term ||
        searchable.some((value) =>
          String(value || '').toLowerCase().includes(term)
        );

      return matchesStatus && matchesSearch;
    });
  }, [tickets, filter, search, customerNames]);

  const send = async (event) => {
    event?.preventDefault?.();
    if (!selected || busy || (!draft.trim() && !file)) return;

    setBusy(true);
    setError('');

    try {
      await service.sendMessage({
        uid: user.uid,
        role: normalizedRole,
        ticketId: selected.id,
        text: draft.trim(),
        file,
      });

      setDraft('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      requestAnimationFrame(() => {
        composerRef.current?.focus();
        if (messagesRef.current) {
          messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }
      });
    } catch (err) {
      setError(err.message || 'Could not send message.');
    } finally {
      setBusy(false);
    }
  };

  // Enter sends; Shift+Enter adds a line, matching WhatsApp Web.
  const handleComposerKeyDown = (event) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent?.isComposing
    ) {
      event.preventDefault();
      if (!busy && (draft.trim() || file)) send();
    }
  };

  const handleFileSelected = (event) => {
    const nextFile = event.target.files?.[0] || null;
    event.target.value = '';
    if (!nextFile) return;

    const isImage = nextFile.type.startsWith('image/');
    const isPdf = nextFile.type === 'application/pdf';

    if (!isImage && !isPdf) {
      setError('Please select an image or PDF file.');
      return;
    }

    if (nextFile.size > 10 * 1024 * 1024) {
      setError('The attachment must be 10 MB or smaller.');
      return;
    }

    setError('');
    setFile(nextFile);
  };
  const changeStatus = async (value) => {
    if (!selected) return;

    const previousStatus = status;

    setStatus(value);
    setError('');

    try {
      await service.updateTicketStatus(selected.id, value);

      setSelected((previous) =>
        previous ? { ...previous, status: value } : previous
      );
    } catch (err) {
      setStatus(previousStatus);
      setError(err.message || 'Could not update ticket status.');
    }
  };

  const assign = async () => {
    if (!selected || assignBusy) return;

    setAssignBusy(true);
    setError('');

    try {
      await service.assignTicket(
        selected.id,
        assignUid.trim(),
        assignName.trim()
      );
    } catch (err) {
      setError(err.message || 'Could not assign ticket.');
    } finally {
      setAssignBusy(false);
    }
  };

  if (!user?.uid || !authorized) {
    return (
      <div className="sc-shell">
        <div className="sc-empty">
          <FaHeadset />
          <h2>Support team access required</h2>
          <p>
            Sign in with an authorized staff account to view conversations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="sc-shell sc-staff-shell">
      <header className="sc-header">
        <div className="sc-brand">
          <span className="sc-brand-icon">
            <FaHeadset />
          </span>

          <div>
            <h2>Support Inbox</h2>
            <p>Customer conversations in real time</p>
          </div>
        </div>

        <div className="sc-inbox-count">
          {tickets.filter((ticket) => (ticket.staffUnread || 0) > 0).length}
          {' '}unread
        </div>
      </header>

      {error && (
        <div className="sc-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <div className="sc-layout">
        <aside
          className={`sc-list ${
            selected ? 'sc-list-hidden-mobile' : ''
          }`}
        >
          <div className="sc-search">
            <FaSearch />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tickets, customers, orders…"
              aria-label="Search tickets"
            />
          </div>

          <div className="sc-filters">
            {[
              ['all', 'All'],
              ['open', 'Open'],
              ['in_progress', 'In progress'],
              ['waiting_customer', 'Waiting'],
              ['closed', 'Closed'],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={filter === value ? 'active' : ''}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {filtered.map((ticket) => (
            <button
              type="button"
              key={ticket.id}
              className={`sc-ticket ${
                selected?.id === ticket.id ? 'is-selected' : ''
              }`}
              onClick={() => setSelected(ticket)}
            >
              <div className="sc-ticket-top">
                <strong>{ticket.subject || 'Support request'}</strong>

                {(ticket.staffUnread || 0) > 0 && (
                  <b className="sc-unread">{ticket.staffUnread}</b>
                )}
              </div>

              <div className="sc-customer-line">
                <span className="sc-customer-avatar">
                  <FaUser />
                </span>

                <span className="sc-customer-details">
                  <strong>{getCustomerName(ticket)}</strong>
                  <small>{ticket.customerUid || 'Customer account'}</small>
                </span>

                <span
                  className={`sc-status status-${ticket.status || 'open'}`}
                >
                  {displayStatus(ticket.status)}
                </span>
              </div>

              {ticket.orderId && (
                <div className="sc-order-summary">
                  <FaShoppingBag />

                  <span>
                    Order: {ticket.orderDisplayId || ticket.orderId}
                  </span>

                  {ticket.orderAmount != null && (
                    <strong>{formatCurrency(ticket.orderAmount)}</strong>
                  )}
                </div>
              )}

              <p>{ticket.lastMessagePreview || 'No messages yet'}</p>

              <small>
                {formatDate(ticket.lastMessageAt || ticket.createdAt)}
              </small>
            </button>
          ))}

          {!filtered.length && (
            <div className="sc-empty-small">
              No tickets match this filter.
            </div>
          )}
        </aside>

        <main
          className={`sc-chat ${
            !selected ? 'sc-chat-placeholder' : ''
          }`}
        >
          {!selected ? (
            <div className="sc-empty">
              <FaHeadset />
              <h3>Choose a conversation</h3>
              <p>
                Read customer messages, assign a teammate, reply and update
                ticket status.
              </p>
            </div>
          ) : (
            <>
              <div className="sc-chat-head">
                <button
                  type="button"
                  className="sc-back sc-mobile-back"
                  onClick={() => setSelected(null)}
                  aria-label="Back to tickets"
                >
                  <FaArrowLeft />
                </button>

                <div className="sc-chat-customer-avatar">
                  <FaUser />
                </div>

                <div className="sc-chat-customer-info">
                  <h3>{selected.subject || 'Support request'}</h3>

                  <p className="sc-customer-name">
                    {getCustomerName(selected)}
                  </p>

                  <p className="sc-customer-uid">
                    Customer ID: {selected.customerUid || 'Unavailable'}
                  </p>

                  {selected.orderId && (
                    <p className="sc-order-reference">
                      Order: {selected.orderDisplayId || selected.orderId}

                      {selected.orderAmount != null &&
                        ` · ${formatCurrency(selected.orderAmount)}`}

                      {selected.orderStatus &&
                        ` · ${selected.orderStatus}`}
                    </p>
                  )}
                </div>

                <span className={`sc-status status-${status}`}>
                  {displayStatus(status)}
                </span>
              </div>

              <div className="sc-staff-tools sc-staff-tools-premium">
                <label>
                  Ticket status
                  <select
                    value={status}
                    onChange={(event) => changeStatus(event.target.value)}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="waiting_customer">Waiting for customer</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>

                <div className="sc-assignee-card">
                  <span className="sc-assignee-avatar">
                    <FaUserCheck />
                  </span>

                  <div className="sc-assignee-info">
                    <small>ASSIGN TO</small>
                    <strong>{assignName || currentStaffName}</strong>
                    <span>
                      {selected.assignedTo
                        ? selected.assignedTo === user.uid
                          ? 'Assigned to you'
                          : 'Currently assigned'
                        : 'Not yet assigned'}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="sc-secondary sc-assign-me"
                    disabled={assignBusy || selected.assignedTo === user.uid}
                    onClick={async () => {
                      setAssignBusy(true);
                      setError('');

                      try {
                        await service.assignTicket(
                          selected.id,
                          user.uid,
                          currentStaffName
                        );

                        setAssignUid(user.uid);
                        setAssignName(currentStaffName);
                        setSelected((old) => old
                          ? {
                              ...old,
                              assignedTo: user.uid,
                              assignedName: currentStaffName,
                            }
                          : old
                        );
                      } catch (err) {
                        setError(err.message || 'Could not assign ticket.');
                      } finally {
                        setAssignBusy(false);
                      }
                    }}
                  >
                    <FaUserCheck />
                    {assignBusy
                      ? 'Assigning…'
                      : selected.assignedTo === user.uid
                        ? 'Assigned to you'
                        : 'Assign to me'}
                  </button>
                </div>
              </div>

              <div className="sc-messages">
                {messages.map((message) => {
                  const isMine = message.senderUid === user.uid;

                  const senderName = isMine
                    ? currentStaffName || 'You'
                    : message.senderRole === 'customer'
                      ? getCustomerName(selected)
                      : 'Support team';

                  return (
                    <div
                      key={message.id}
                      className={`sc-message-row ${
                        isMine ? 'mine' : ''
                      }`}
                    >
                      <div className="sc-message">
                        <span className="sc-sender">{senderName}</span>

                        {message.text && <p>{message.text}</p>}

                        {message.attachment?.url &&
                        (String(message.attachment.type || '').startsWith('image/') ||
                          /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(message.attachment.name || '')) ? (
                          <a
                            className="sc-image-attachment"
                            href={message.attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open image ${message.attachment.name || ''}`}
                          >
                            <img
                              src={message.attachment.url}
                              alt={message.attachment.name || 'Shared image'}
                              loading="lazy"
                            />
                          </a>
                        ) : message.attachment?.url ? (
                          <a
                            className="sc-attachment"
                            href={message.attachment.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {String(message.attachment.type || '').includes('pdf') ? (
                              <FaFilePdf />
                            ) : (
                              <FaPaperclip />
                            )}
                            {message.attachment.name || 'Open attachment'}
                          </a>
                        ) : null}

                        <time>{formatDate(message.createdAt)}</time>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form className="sc-composer sc-whatsapp-composer" onSubmit={send}>
                <label className="sc-attach sc-attach-icon" title="Attach image or PDF">
                  <FaPaperclip />
                  <input
                    ref={fileInputRef}
                    id="support-reply-file"
                    className="sc-hidden-file-input"
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    onChange={handleFileSelected}
                  />
                </label>

                <div className="sc-compose-field">
                  {file && (
                    <div className="sc-file-preview">
                      <span className="sc-file-preview-icon">
                        {file.type.startsWith('image/') ? <FaPaperclip /> : <FaFilePdf />}
                      </span>
                      <span className="sc-file-preview-name" title={file.name}>
                        {file.name}
                        <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
                      </span>
                      <button
                        type="button"
                        className="sc-remove-file"
                        onClick={() => {
                          setFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        aria-label="Remove attachment"
                      >
                        <FaTimes />
                      </button>
                    </div>
                  )}

                  <textarea
                    ref={composerRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    rows={1}
                    maxLength={5000}
                    placeholder="Type a message"
                    aria-label="Reply to customer"
                  />

                  <small className="sc-enter-hint">
                    Enter to send · Shift+Enter for a new line
                  </small>
                </div>

                <button
                  type="submit"
                  className="sc-send"
                  disabled={busy || (!draft.trim() && !file)}
                  aria-label="Send reply"
                  title="Send message"
                >
                  <FaPaperPlane />
                </button>
              </form>
            </>
          )}
        </main>
      </div>
    </section>
  );
}
