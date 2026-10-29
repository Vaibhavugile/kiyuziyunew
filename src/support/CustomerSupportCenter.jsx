import React, { useEffect, useMemo, useRef, useState } from 'react';

import {

  FaPaperclip,

  FaPlus,

  FaArrowLeft,

  FaPaperPlane,

  FaHeadset,

  FaTimes,

  FaBoxOpen,

  FaChevronRight,

  FaRegClock,

  FaCheckCircle,

  FaShoppingBag,

  FaQuestionCircle,

  FaTruck,

  FaUndoAlt,

  FaCreditCard,

  FaSearch,

  FaFilePdf,

} from 'react-icons/fa';

import { createSupportService } from './supportService';

import './supportc.css';

const SUBJECTS = [

  { label: 'Order status', icon: FaTruck },

  { label: 'Delivery issue', icon: FaBoxOpen },

  { label: 'Return / exchange', icon: FaUndoAlt },

  { label: 'Payment issue', icon: FaCreditCard },

  { label: 'Product query', icon: FaShoppingBag },

  { label: 'Other help', icon: FaQuestionCircle },

];

const STAFF_ROLES = [

  'superadmin',

  'manager',

  'sales',

  'admin',

  'support',

];

const money = (value) =>

  new Intl.NumberFormat('en-IN', {

    style: 'currency',

    currency: 'INR',

    maximumFractionDigits: 2,

  }).format(Number(value || 0));

const orderLabel = (order) =>

  String(order.orderNumber || order.orderId || order.id || '').slice(0, 40);

const normalStatus = (status) =>

  String(status || 'open').replace(/[_-]/g, ' ');

const dateLabel = (value) => {

  const date = value?.toDate

    ? value.toDate()

    : value

      ? new Date(value)

      : null;

  return date && !Number.isNaN(date.getTime())

    ? date.toLocaleDateString('en-IN', {

        day: 'numeric',

        month: 'short',

        year: 'numeric',

      })

    : 'Date unavailable';

};

const timeLabel = (value) => {

  const date = value?.toDate

    ? value.toDate()

    : value

      ? new Date(value)

      : null;

  return date && !Number.isNaN(date.getTime())

    ? date.toLocaleTimeString([], {

        hour: 'numeric',

        minute: '2-digit',

      })

    : 'Sending…';

};

export default function CustomerSupportCenter({
  db,
  storage,
  user,
  profile,
  initialView = 'latest',
  compact = false,
}) {

  const service = useMemo(

    () => createSupportService({ db, storage }),

    [db, storage]

  );

  const [tickets, setTickets] = useState([]);

  const [orders, setOrders] = useState([]);

  const [ordersLoading, setOrdersLoading] = useState(true);

  const [selected, setSelected] = useState(null);

  const [messages, setMessages] = useState([]);

  const [subject, setSubject] = useState('');

  const [orderId, setOrderId] = useState('');

  const [draft, setDraft] = useState('');

  const [file, setFile] = useState(null);

  const [creating, setCreating] = useState(() => initialView === 'new');

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState('');

  const messagesRef = useRef(null);

  const composerRef = useRef(null);

  const fileInputRef = useRef(null);

  const previousMessageCount = useRef(0);

  // Subscribe to the customer's tickets.

  useEffect(() => {

    if (!user?.uid) {

      setTickets([]);

      return undefined;

    }

    return service.subscribeToCustomerTickets(

      user.uid,

      setTickets,

      (err) => setError(err.message || 'Could not load conversations.')

    );

  }, [service, user?.uid]);

  // In the compact widget, automatically open the latest active conversation.
  useEffect(() => {
    if (initialView !== 'latest' || creating || selected || tickets.length === 0) {
      return;
    }

    const timestamp = (value) => {
      if (value?.toDate) return value.toDate().getTime();
      const parsed = value ? new Date(value).getTime() : 0;
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const newestFirst = [...tickets].sort((a, b) =>
      timestamp(b.lastMessageAt || b.updatedAt || b.createdAt) -
      timestamp(a.lastMessageAt || a.updatedAt || a.createdAt)
    );

    const latestOpen = newestFirst.find((ticket) =>
      String(ticket.status || 'open').toLowerCase() !== 'closed'
    );

    setSelected(latestOpen || newestFirst[0]);
  }, [tickets, selected, creating, initialView]);

  // Fetch the customer's five most recent orders.

  useEffect(() => {

    if (!user?.uid) {

      setOrders([]);

      setOrdersLoading(false);

      return undefined;

    }

    setOrdersLoading(true);

    return service.subscribeToRecentOrders(

      user.uid,

      (items) => {

        setOrders(items);

        setOrdersLoading(false);

      },

      (err) => {

        setOrdersLoading(false);

        setError(err.message || 'Could not load recent orders.');

      }

    );

  }, [service, user?.uid]);

  // Subscribe to messages for the selected conversation.

  useEffect(() => {

    if (!selected?.id) {

      setMessages([]);

      previousMessageCount.current = 0;

      return undefined;

    }

    const unsubscribe = service.subscribeToMessages(

      selected.id,

      (items) => setMessages(items),

      (err) => setError(err.message || 'Could not load messages.')

    );

    service.markRead(selected.id, 'customer').catch(() => {});

    return unsubscribe;

  }, [service, selected?.id]);

  // Scroll to the bottom when opening a chat or receiving new messages.

  useEffect(() => {

    const container = messagesRef.current;

    if (!container) return;

    container.scrollTop = container.scrollHeight;

    previousMessageCount.current = messages.length;

  }, [selected?.id, messages.length]);

  const openNewTicket = () => {

    setSelected(null);

    setCreating(true);

    setSubject('');

    setOrderId('');

    setDraft('');

    setFile(null);

    setError('');

  };

  const openTicket = (ticket) => {

    setSelected(ticket);

    setCreating(false);

    setDraft('');

    setFile(null);

    setError('');

  };

  const startTicket = async (event) => {

    event.preventDefault();

    if (!subject.trim() || (!draft.trim() && !file) || busy) {

      return;

    }

    setBusy(true);

    setError('');

    try {

      const chosenOrder =

        orders.find((order) => order.id === orderId) || null;

      const newTicketId = await service.createTicket({

        uid: user.uid,

        displayName:

          profile?.displayName ||

          profile?.fullName ||

          user.displayName ||

          user.email ||

          'Customer',

        subject: subject.trim(),

        orderId,

        selectedOrder: chosenOrder,

        message: draft.trim(),

        attachment: file,

      });

      const orderDetails = chosenOrder

        ? {

            orderId: chosenOrder.id,

            orderDisplayId: orderLabel(chosenOrder),

            orderAmount: Number(

              chosenOrder.totalAmount ??

                chosenOrder.total ??

                chosenOrder.grandTotal ??

                0

            ),

            orderStatus: String(

              chosenOrder.status || 'processing'

            ),

          }

        : {};

      setSelected({

        id: newTicketId,

        subject: subject.trim(),

        status: 'open',

        ...orderDetails,

      });

      setSubject('');

      setOrderId('');

      setDraft('');

      setFile(null);

      setCreating(false);

    } catch (err) {

      setError(err.message || 'Could not create support request.');

    } finally {

      setBusy(false);

    }

  };

  const send = async (event) => {

    event?.preventDefault?.();

    if (!selected || busy || (!draft.trim() && !file)) {

      return;

    }

    setBusy(true);

    setError('');

    try {

      await service.sendMessage({

        uid: user.uid,

        role: 'customer',

        ticketId: selected.id,

        text: draft.trim(),

        file,

      });

      setDraft('');

      setFile(null);

      requestAnimationFrame(() => {

        composerRef.current?.focus();

        if (messagesRef.current) {

          messagesRef.current.scrollTop =

            messagesRef.current.scrollHeight;

        }

      });

    } catch (err) {

      setError(err.message || 'Message could not be sent.');

    } finally {

      setBusy(false);

    }

  };

  // WhatsApp-style keyboard behaviour:

  // Enter sends, Shift+Enter inserts a newline.

  const handleComposerKeyDown = (event) => {

    if (

      event.key === 'Enter' &&

      !event.shiftKey &&

      !event.nativeEvent?.isComposing

    ) {

      event.preventDefault();

      if (!busy && (draft.trim() || file)) {

        send();

      }

    }

  };

  const handleFileSelected = (event) => {

    const nextFile = event.target.files?.[0] || null;

    // Allow selecting the same file again later.

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

  if (!user?.uid) {

    return (

      <section className="sc-shell sc-customer-shell">

        <div className="sc-empty">

          <span className="sc-empty-icon">

            <FaHeadset />

          </span>

          <h2>Sign in to contact support</h2>

          <p>

            Your conversations and order help are waiting in one place.

            Sign in to continue.

          </p>

        </div>

      </section>

    );

  }

  return (

    <section className={`sc-shell sc-customer-shell sc-whatsapp-layout ${compact ? 'sc-compact' : ''}`}>

      {/* Compact support header */}

      <header className="sc-header">

        <div className="sc-brand">

          <span className="sc-brand-icon">

            <FaHeadset />

          </span>

          <div>

            <span className="sc-eyebrow">WE'RE HERE TO HELP</span>

            <h2>Customer care</h2>

            <p>Personal support for every order</p>

          </div>

        </div>

        <button

          type="button"

          className="sc-primary"

          onClick={openNewTicket}

        >

          <FaPlus />

          <span>New request</span>

        </button>

      </header>

      <div className="sc-trust-strip">

        <span>

          <FaCheckCircle /> Real-time replies

        </span>

        <span>

          <FaRegClock /> Conversation history saved

        </span>

        <span className="sc-secure-label">Private support</span>

      </div>

      {error && (

        <div className="sc-error" role="alert">

          <span>{error}</span>

          <button

            type="button"

            onClick={() => setError('')}

            aria-label="Dismiss error"

          >

            <FaTimes />

          </button>

        </div>

      )}

      <div className="sc-layout">

        {/* Conversation sidebar */}

        <aside

          className={`sc-list ${

            selected || creating ? 'sc-list-hidden-mobile' : ''

          }`}

        >

          <div className="sc-list-heading">

            <div>

              <strong>Your conversations</strong>

              <small>All your support requests in one place</small>

            </div>

            <span>{tickets.length}</span>

          </div>

          {tickets.length === 0 ? (

            <div className="sc-list-empty">

              <span>

                <FaHeadset />

              </span>

              <strong>No conversations yet</strong>

              <p>

                Need help with an order? Start a request and our team

                will help.

              </p>

              <button

                type="button"

                className="sc-secondary"

                onClick={openNewTicket}

              >

                <FaPlus /> Create a request

              </button>

            </div>

          ) : (

            tickets.map((ticket) => (

              <button

                type="button"

                key={ticket.id}

                className={`sc-ticket ${

                  selected?.id === ticket.id ? 'is-selected' : ''

                }`}

                onClick={() => openTicket(ticket)}

              >

                <div className="sc-ticket-top">

                  <strong>{ticket.subject || 'Support request'}</strong>

                  <span

                    className={`sc-status status-${ticket.status || 'open'}`}

                  >

                    {normalStatus(ticket.status || 'open')}

                  </span>

                </div>

                {ticket.orderId && (

                  <small className="sc-order-mini">

                    Order #{ticket.orderDisplayId || ticket.orderId}

                    {ticket.orderAmount != null

                      ? ` · ${money(ticket.orderAmount)}`

                      : ''}

                  </small>

                )}

                <p>

                  {ticket.lastMessagePreview || 'Conversation started'}

                </p>

                <div className="sc-ticket-bottom">

                  <small>

                    {ticket.lastMessageAt?.toDate

                      ? ticket.lastMessageAt.toDate().toLocaleString()

                      : 'Just now'}

                  </small>

                  {ticket.customerUnread > 0 && (

                    <b className="sc-unread">{ticket.customerUnread}</b>

                  )}

                </div>

              </button>

            ))

          )}

          <div className="sc-sidebar-help">

            <span>

              <FaQuestionCircle />

            </span>

            <div>

              <strong>Still need help?</strong>

              <p>Our team is here to guide you.</p>

              <button type="button" onClick={openNewTicket}>

                Contact support <FaChevronRight />

              </button>

            </div>

          </div>

        </aside>

        {/* Main chat area */}

        <main

          className={`sc-chat ${

            !selected && !creating ? 'sc-chat-placeholder' : ''

          }`}

        >

          {/* New conversation form */}

          {creating ? (

            <form className="sc-new-form" onSubmit={startTicket}>

              <button

                type="button"

                className="sc-back"

                onClick={() => setCreating(false)}

              >

                <FaArrowLeft /> Back to conversations

              </button>

              <div className="sc-form-hero">

                <span className="sc-form-icon">

                  <FaHeadset />

                </span>

                <div>

                  <span className="sc-eyebrow">CUSTOMER CARE</span>

                  <h3>How can we help?</h3>

                  <p>

                    Tell us what you need and we'll keep everything in

                    one conversation.

                  </p>

                </div>

              </div>

              <section className="sc-form-section">

                <div className="sc-section-title">

                  <span>01</span>

                  <div>

                    <strong>What is this about?</strong>

                    <small>Choose a topic</small>

                  </div>

                </div>

                <div className="sc-subject-grid">

                  {SUBJECTS.map(({ label, icon: Icon }) => (

                    <button

                      type="button"

                      key={label}

                      className={`sc-subject-choice ${

                        subject === label ? 'active' : ''

                      }`}

                      onClick={() => setSubject(label)}

                    >

                      <Icon />

                      <span>{label}</span>

                      {subject === label && (

                        <FaCheckCircle className="sc-choice-check" />

                      )}

                    </button>

                  ))}

                </div>

                <label className="sc-field-label">

                  Subject <span>Required</span>

                  <input

                    required

                    maxLength={140}

                    value={subject}

                    onChange={(event) => setSubject(event.target.value)}

                    placeholder="Briefly describe your query"

                  />

                </label>

              </section>

              <section className="sc-form-section">

                <div className="sc-section-title">

                  <span>02</span>

                  <div>

                    <strong>Related order</strong>

                    <small>

                      Choose one of your five most recent orders (optional)

                    </small>

                  </div>

                </div>

                {ordersLoading ? (

                  <div className="sc-orders-loading">

                    <span className="sc-spinner" />

                    Loading your recent orders…

                  </div>

                ) : orders.length > 0 ? (

                  <div className="sc-order-grid">

                    {orders.map((order) => {

                      const chosen = orderId === order.id;

                      return (

                        <button

                          type="button"

                          key={order.id}

                          className={`sc-order-card ${

                            chosen ? 'active' : ''

                          }`}

                          onClick={() =>

                            setOrderId(chosen ? '' : order.id)

                          }

                        >

                          <span className="sc-order-card-icon">

                            <FaBoxOpen />

                          </span>

                          <span className="sc-order-card-main">

                            <strong>#{orderLabel(order)}</strong>

                            <small>{dateLabel(order.createdAt)}</small>

                            <b>

                              {money(

                                order.totalAmount ??

                                  order.total ??

                                  order.grandTotal ??

                                  0

                              )}

                            </b>

                          </span>

                          <span

                            className={`sc-status status-${String(

                              order.status || 'processing'

                            )

                              .toLowerCase()

                              .replace(/\s+/g, '_')}`}

                          >

                            {normalStatus(order.status || 'processing')}

                          </span>

                          <span className="sc-order-select">

                            {chosen ? <FaCheckCircle /> : <span />}

                          </span>

                        </button>

                      );

                    })}

                  </div>

                ) : (

                  <div className="sc-no-orders">

                    <FaSearch />

                    <div>

                      <strong>No recent orders found</strong>

                      <p>

                        You can still create a general support request

                        without linking an order.

                      </p>

                    </div>

                  </div>

                )}

                {orderId && (

                  <button

                    type="button"

                    className="sc-clear-order"

                    onClick={() => setOrderId('')}

                  >

                    Remove selected order

                  </button>

                )}

              </section>

              <section className="sc-form-section">

                <div className="sc-section-title">

                  <span>03</span>

                  <div>

                    <strong>Tell us more</strong>

                    <small>Include any details that can help us</small>

                  </div>

                </div>

                <label className="sc-field-label">

                  Your message <span>Required</span>

                  <textarea

                    required

                    maxLength={5000}

                    value={draft}

                    onChange={(event) => setDraft(event.target.value)}

                    placeholder="Describe your issue or question…"

                    rows={4}

                  />

                </label>

                <AttachmentPicker

                  file={file}

                  setFile={setFile}

                  inputRef={fileInputRef}

                  onFileSelected={handleFileSelected}

                />

                {file && (

                  <AttachmentPreview

                    file={file}

                    onRemove={() => setFile(null)}

                  />

                )}

              </section>

              <div className="sc-submit-row">

                <div>

                  <strong>We'll take it from here.</strong>

                  <small>Your request and replies stay in your inbox.</small>

                </div>

                <button

                  type="submit"

                  className="sc-primary sc-submit"

                  disabled={

                    busy ||

                    !subject.trim() ||

                    (!draft.trim() && !file)

                  }

                >

                  {busy ? 'Creating request…' : 'Send request'}

                  <FaPaperPlane />

                </button>

              </div>

            </form>

          ) : selected ? (

            <>

              {/* Chat title */}

              <div className="sc-chat-head">

                <button

                  type="button"

                  className="sc-back sc-mobile-back"

                  onClick={() => setSelected(null)}

                  aria-label="Back to conversations"

                >

                  <FaArrowLeft />

                </button>

                <span className="sc-chat-avatar">

                  <FaHeadset />

                </span>

                <div>

                  <h3>{selected.subject || 'Support request'}</h3>

                  <p>

                    {selected.orderId

                      ? `Order #${

                          selected.orderDisplayId || selected.orderId

                        }${

                          selected.orderAmount != null

                            ? ` · ${money(selected.orderAmount)}`

                            : ''

                        }`

                      : 'Customer care conversation'}

                  </p>

                </div>

                <span

                  className={`sc-status status-${selected.status || 'open'}`}

                >

                  {normalStatus(selected.status || 'open')}

                </span>

              </div>

              {/* Related order strip */}

              {selected.orderId && (

                <div className="sc-linked-order">

                  <span className="sc-linked-order-icon">

                    <FaBoxOpen />

                  </span>

                  <div>

                    <small>RELATED ORDER</small>

                    <strong>

                      #{selected.orderDisplayId || selected.orderId}

                    </strong>

                  </div>

                  {selected.orderAmount != null && (

                    <div className="sc-linked-amount">

                      <small>ORDER TOTAL</small>

                      <strong>{money(selected.orderAmount)}</strong>

                    </div>

                  )}

                  {selected.orderStatus && (

                    <span

                      className={`sc-status status-${String(

                        selected.orderStatus

                      )

                        .toLowerCase()

                        .replace(/\s+/g, '_')}`}

                    >

                      {normalStatus(selected.orderStatus)}

                    </span>

                  )}

                </div>

              )}

              {/* Scrollable message history */}

              <div className="sc-messages" ref={messagesRef}>

                <div className="sc-conversation-note">

                  <span>

                    <FaHeadset />

                  </span>

                  <div>

                    <strong>You're talking to customer care</strong>

                    <p>

                      Send a message below and we'll reply right here.

                    </p>

                  </div>

                </div>

                {messages.map((message) => {

                  const isMine = message.senderUid === user.uid;

                  const attachment = message.attachment;

                  const isImage =

                    attachment &&

                    (String(attachment.type || '').startsWith('image/') ||

                      /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(

                        attachment.name || ''

                      ));

                  const isStaff = STAFF_ROLES.includes(

                    String(message.senderRole || '').toLowerCase()

                  );

                  return (

                    <div

                      key={message.id}

                      className={`sc-message-row ${

                        isMine ? 'mine' : ''

                      }`}

                    >

                      <div className="sc-message">

                        <span className="sc-sender">

                          {isMine

                            ? 'You'

                            : isStaff

                              ? 'Store support team'

                              : 'Support team'}

                        </span>

                        {attachment && isImage && (

                          <a

                            className="sc-image-attachment"

                            href={attachment.url}

                            target="_blank"

                            rel="noreferrer"

                            aria-label={`Open image ${

                              attachment.name || ''

                            }`}

                          >

                            <img

                              src={attachment.url}

                              alt={attachment.name || 'Shared image'}

                              loading="lazy"

                            />

                          </a>

                        )}

                        {message.text && <p>{message.text}</p>}

                        {attachment && !isImage && (

                          <a

                            className="sc-attachment"

                            href={attachment.url}

                            target="_blank"

                            rel="noreferrer"

                          >

                            <FaFilePdf />

                            {attachment.name || 'Open attachment'}

                            <span>↗</span>

                          </a>

                        )}

                        <time>{timeLabel(message.createdAt)}</time>

                      </div>

                    </div>

                  );

                })}

                {messages.length === 0 && (

                  <div className="sc-empty-small">

                    Your conversation is ready. Send a message to get

                    started.

                  </div>

                )}

              </div>

              {selected.status === 'closed' && (

                <div className="sc-closed-note">

                  This conversation is closed. Sending a message will

                  reopen it if your support service allows that.

                </div>

              )}

              {/* WhatsApp-style message composer */}

              <form className="sc-composer sc-whatsapp-composer" onSubmit={send}>

                <AttachmentPicker

                  file={file}

                  setFile={setFile}

                  inputRef={fileInputRef}

                  onFileSelected={handleFileSelected}

                />

                <div className="sc-compose-field">

                  {file && (

                    <AttachmentPreview

                      file={file}

                      onRemove={() => setFile(null)}

                    />

                  )}

                  <textarea

                    ref={composerRef}

                    value={draft}

                    onChange={(event) => setDraft(event.target.value)}

                    onKeyDown={handleComposerKeyDown}

                    rows={1}

                    maxLength={5000}

                    placeholder="Type a message"

                    aria-label="Write your message"

                  />

                  <small className="sc-enter-hint">

                    Enter to send · Shift+Enter for a new line

                  </small>

                </div>

                <button

                  className="sc-send"

                  type="submit"

                  disabled={busy || (!draft.trim() && !file)}

                  aria-label="Send message"

                  title="Send message"

                >

                  {busy ? (

                    <span className="sc-send-spinner" />

                  ) : (

                    <FaPaperPlane />

                  )}

                </button>

              </form>

            </>

          ) : (

            <div className="sc-empty">

              <span className="sc-empty-icon">

                <FaHeadset />

              </span>

              <span className="sc-eyebrow">CUSTOMER CARE</span>

              <h3>How can we help you?</h3>

              <p>

                Select a conversation to continue, or start a new request

                and link one of your recent orders.

              </p>

              <button

                type="button"

                className="sc-primary"

                onClick={openNewTicket}

              >

                <FaPlus /> Start a conversation

              </button>

              <div className="sc-empty-benefits">

                <span>

                  <FaCheckCircle /> Order-aware support

                </span>

                <span>

                  <FaRegClock /> Replies saved here

                </span>

              </div>

            </div>

          )}

        </main>

      </div>

    </section>

  );

}

function AttachmentPicker({

  file,

  setFile,

  inputRef,

  onFileSelected,

}) {

  return (

    <div className="sc-attachment-picker sc-compact-attachment-picker">

      <input

        ref={inputRef}

        className="sc-hidden-file-input"

        type="file"

        accept="image/*,.pdf,application/pdf"

        onChange={onFileSelected}

      />

      <button

        type="button"

        className="sc-attach sc-attach-icon"

        onClick={() => inputRef.current?.click()}

        aria-label="Attach image or PDF"

        title="Attach image or PDF"

      >

        <FaPlus />

      </button>

    </div>

  );

}

function AttachmentPreview({ file, onRemove }) {

  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {

    if (!file || !file.type?.startsWith('image/')) {

      setPreviewUrl('');

      return undefined;

    }

    const url = URL.createObjectURL(file);

    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);

  }, [file]);

  return (

    <div className="sc-attachment-preview">

      {previewUrl ? (

        <img src={previewUrl} alt="Image attachment preview" />

      ) : (

        <span className="sc-file-preview-icon">

          <FaFilePdf />

        </span>

      )}

      <div className="sc-attachment-preview-info">

        <strong>{file.name}</strong>

        <small>

          {(file.size / (1024 * 1024)).toFixed(2)} MB · Ready to send

        </small>

      </div>

      <button

        type="button"

        onClick={onRemove}

        aria-label="Remove attachment"

        title="Remove attachment"

      >

        <FaTimes />

      </button>

    </div>

  );

}
