
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  startAfter,
  startAt,
  endAt,
  limit,
  documentId,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ROLE_CONFIG as DEFAULT_ROLE_CONFIG } from '../config/roles';
import './CustomerManagement.css';

const PAGE_SIZE = 50;
const SEARCH_LIMIT = 50;
const SEARCH_DELAY = 350;

const NAME_FIELDS = ['name', 'displayName', 'fullName', 'customerName'];
const PREFIX_FIELDS = [
  'name',
  'displayName',
  'fullName',
  'customerName',
  'address',
  'country',
  'email',
  'mobile',
  'phone',
  'phoneNumber',
  'uid',
];

const normalise = (value) => String(value ?? '').trim().toLowerCase();

const getName = (data) =>
  data.name || data.displayName || data.fullName || data.customerName || 'Unnamed customer';

const getPhone = (data) =>
  data.mobile || data.phone || data.phoneNumber || '';

const getOverride = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? String(number) : '';
};

const toCustomer = (snapshot) => {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    name: getName(data),
    email: data.email || '',
    phone: getPhone(data),
    address: data.address || '',
    country: data.country || '',
    uid: data.uid || snapshot.id,
    role: normalise(data.role) || 'retailer',
    minimumOrderValue: getOverride(data.minimumOrderValue),
    dirty: false,
  };
};

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

export default function CustomerManagement() {
  const [customers, setCustomers] = useState([]);
  const [roleConfigs, setRoleConfigs] = useState(DEFAULT_ROLE_CONFIG || {});
  const [roleFilter, setRoleFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [bulkFromRole, setBulkFromRole] = useState('wholesaler');
  const [bulkToRole, setBulkToRole] = useState('retailer');
  const [bulkPreviewDocs, setBulkPreviewDocs] = useState([]);
  const [bulkWorking, setBulkWorking] = useState(false);

  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [cursorStack, setCursorStack] = useState([]);

  const lastDocRef = useRef(null);
  const debounceRef = useRef(null);
  const searchRequestRef = useRef(0);

  // Read the role configuration once.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'appConfig', 'roles'));
        if (!cancelled && snap.exists() && snap.data()?.roles) {
          setRoleConfigs((old) => ({ ...old, ...snap.data().roles }));
        }
      } catch (err) {
        console.error('Role configuration load failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const roles = useMemo(() => {
    const result = new Set(Object.keys(roleConfigs || {}));
    customers.forEach((customer) => result.add(customer.role));
    return [...result].filter(Boolean).sort();
  }, [roleConfigs, customers]);

  // Debounce search input.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      setActiveSearch(searchInput.trim());
    }, SEARCH_DELAY);

    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const resetPageState = useCallback(() => {
    setPage(1);
    setCursorStack([]);
    lastDocRef.current = null;
    setHasNext(false);
  }, []);

  // Normal browsing: fetch only one page.
  const loadPage = useCallback(async (direction = 'first') => {
    setLoading(true);
    setError('');
    setNotice('');

    try {
      const constraints = [];

      if (roleFilter !== 'all') {
        constraints.push(where('role', '==', roleFilter));
      }

      constraints.push(orderBy(documentId()));

      let cursor = null;

      if (direction === 'next') {
        cursor = lastDocRef.current;
      } else if (direction === 'previous') {
        cursor = cursorStack[page - 2] || null;
      }

      if (cursor) constraints.push(startAfter(cursor));

      constraints.push(limit(PAGE_SIZE + 1));

      const snap = await getDocs(
        query(collection(db, 'users'), ...constraints)
      );

      const docs = snap.docs;
      const visible = docs.slice(0, PAGE_SIZE);

      lastDocRef.current = visible[visible.length - 1] || null;
      setHasNext(docs.length > PAGE_SIZE);
      setCustomers(visible.map(toCustomer));

      if (direction === 'next' && cursor) {
        setCursorStack((old) => [...old, cursor]);
        setPage((old) => old + 1);
      } else if (direction === 'previous') {
        setCursorStack((old) => old.slice(0, -1));
        setPage((old) => Math.max(1, old - 1));
      } else {
        setPage(1);
        setCursorStack([]);
      }
    } catch (err) {
      console.error('Customer page load failed:', err);
      setError(err.message || 'Could not load customers. Check Firestore rules and indexes.');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, cursorStack, page]);

  useEffect(() => {
    if (!activeSearch) {
      resetPageState();
      loadPage('first');
    }
  }, [activeSearch, roleFilter]); // Intentionally reload on filter/search changes.

  // Search all matching documents through Firestore queries, not the visible page.
  useEffect(() => {
    if (!activeSearch) {
      setSearching(false);
      return undefined;
    }

    let cancelled = false;
    const requestId = ++searchRequestRef.current;

    const runSearch = async () => {
      setSearching(true);
      setError('');
      setNotice('');

      try {
        const term = activeSearch.trim();
        const lower = normalise(term);
        const digitTerm = term.replace(/\D/g, '');
        const tasks = [];

        // Search index: supports arbitrary partial matches when this field
        // is populated on customer documents.
        tasks.push(
          getDocs(
            query(
              collection(db, 'users'),
              where('searchKeywords', 'array-contains', lower),
              limit(SEARCH_LIMIT)
            )
          )
        );

        // Prefix matching on existing fields. Firestore string prefix
        // queries are case-sensitive and require the field to exist.
        for (const field of PREFIX_FIELDS) {
          tasks.push(
            getDocs(
              query(
                collection(db, 'users'),
                orderBy(field),
                startAt(term),
                endAt(`${term}\uf8ff`),
                limit(SEARCH_LIMIT)
              )
            )
          );
        }

        // Exact matches also cover fields that may not be indexed for prefixes.
        for (const field of ['email', 'mobile', 'phone', 'phoneNumber', 'uid']) {
          tasks.push(
            getDocs(
              query(
                collection(db, 'users'),
                where(field, '==', term),
                limit(SEARCH_LIMIT)
              )
            )
          );
        }

        // Phone digits are searchable as partial matches when the migration
        // adds phone substrings to searchKeywords.
        if (digitTerm.length >= 3 && digitTerm !== lower) {
          tasks.push(
            getDocs(
              query(
                collection(db, 'users'),
                where('searchKeywords', 'array-contains', digitTerm),
                limit(SEARCH_LIMIT)
              )
            )
          );
        }

        const snapshots = await Promise.all(tasks);
        if (cancelled || requestId !== searchRequestRef.current) return;

        const unique = new Map();

        snapshots.forEach((snap) => {
          snap.docs.forEach((customerDoc) => {
            if (!unique.has(customerDoc.id)) {
              unique.set(customerDoc.id, toCustomer(customerDoc));
            }
          });
        });

        let results = [...unique.values()];

        if (roleFilter !== 'all') {
          results = results.filter((customer) => customer.role === roleFilter);
        }

        results.sort((a, b) => a.name.localeCompare(b.name));
        setCustomers(results.slice(0, SEARCH_LIMIT));
        setPage(1);
        setCursorStack([]);
        lastDocRef.current = null;
        setHasNext(false);
      } catch (err) {
        console.error('Customer search failed:', err);

        if (!cancelled && requestId === searchRequestRef.current) {
          setError(
            err.message ||
              'Search failed. Check Firestore indexes and rules.'
          );
          setCustomers([]);
        }
      } finally {
        if (!cancelled && requestId === searchRequestRef.current) {
          setSearching(false);
        }
      }
    };

    runSearch();

    return () => {
      cancelled = true;
    };
  }, [activeSearch, roleFilter]);

  const updateCustomer = (id, field, value) => {
    setCustomers((old) =>
      old.map((customer) =>
        customer.id === id
          ? { ...customer, [field]: value, dirty: true }
          : customer
      )
    );
    setNotice('');
  };

  const effectiveMinimum = (customer) =>
    customer.minimumOrderValue !== ''
      ? Number(customer.minimumOrderValue)
      : Number(roleConfigs?.[customer.role]?.minOrderValue ?? 0);

  const validate = (customer) => {
    if (!roleConfigs?.[customer.role]) {
      return `The role "${customer.role}" is not configured.`;
    }

    if (
      customer.minimumOrderValue !== '' &&
      (!Number.isFinite(Number(customer.minimumOrderValue)) ||
        Number(customer.minimumOrderValue) < 0)
    ) {
      return 'Minimum order value must be a valid number greater than or equal to zero.';
    }

    return '';
  };

  const saveCustomer = async (customer) => {
    if (savingId !== null) return;

    const validationError = validate(customer);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSavingId(customer.id);
    setError('');
    setNotice('');

    try {
      await setDoc(
        doc(db, 'users', customer.id),
        {
          role: customer.role,
          minimumOrderValue:
            customer.minimumOrderValue === ''
              ? null
              : Number(customer.minimumOrderValue),
        },
        { merge: true }
      );

      setCustomers((old) =>
        old.map((item) =>
          item.id === customer.id ? { ...item, dirty: false } : item
        )
      );
      setNotice(`Saved ${customer.name}.`);
    } catch (err) {
      console.error('Customer save failed:', err);
      setError(err.message || 'Could not save customer.');
    } finally {
      setSavingId(null);
    }
  };

  const saveAll = async () => {
    if (savingId !== null) return;

    const changed = customers.filter((customer) => customer.dirty);

    if (!changed.length) {
      setNotice('There are no unsaved changes on this page.');
      return;
    }

    for (const customer of changed) {
      const validationError = validate(customer);
      if (validationError) {
        setError(`${customer.name}: ${validationError}`);
        return;
      }
    }

    if (!window.confirm(`Save changes for ${changed.length} customer(s)?`)) {
      return;
    }

    setSavingId('all');
    setError('');
    setNotice('');

    try {
      const batch = writeBatch(db);

      changed.forEach((customer) => {
        batch.set(
          doc(db, 'users', customer.id),
          {
            role: customer.role,
            minimumOrderValue:
              customer.minimumOrderValue === ''
                ? null
                : Number(customer.minimumOrderValue),
          },
          { merge: true }
        );
      });

      await batch.commit();

      const changedIds = new Set(changed.map((customer) => customer.id));
      setCustomers((old) =>
        old.map((customer) =>
          changedIds.has(customer.id) ? { ...customer, dirty: false } : customer
        )
      );
      setNotice(`Saved ${changed.length} customer(s).`);
    } catch (err) {
      console.error('Bulk save failed:', err);
      setError(err.message || 'Could not save customer changes.');
    } finally {
      setSavingId(null);
    }
  };

  const previewBulkRoleChange = async () => {
    if (!bulkFromRole || !bulkToRole) {
      setError('Choose both the current role and the new role.');
      return;
    }
    if (bulkFromRole === bulkToRole) {
      setError('Choose two different roles.');
      return;
    }
    if (!roleConfigs?.[bulkToRole]) {
      setError(`The target role "${bulkToRole}" is not configured.`);
      return;
    }

    setBulkWorking(true);
    setError('');
    setNotice('');
    setBulkPreviewDocs([]);
    try {
      // Read every user document currently assigned to the source role.
      const snapshot = await getDocs(
        query(collection(db, 'users'), where('role', '==', bulkFromRole))
      );
      setBulkPreviewDocs(snapshot.docs);
      setNotice(
        snapshot.empty
          ? `No customers currently have the ${roleConfigs?.[bulkFromRole]?.label || bulkFromRole} role.`
          : `Preview ready: ${snapshot.size} customer(s) will change from ${roleConfigs?.[bulkFromRole]?.label || bulkFromRole} to ${roleConfigs?.[bulkToRole]?.label || bulkToRole}.`
      );
    } catch (err) {
      console.error('Bulk role preview failed:', err);
      setError(err.message || 'Could not preview customers for this role change.');
    } finally {
      setBulkWorking(false);
    }
  };

  const applyBulkRoleChange = async () => {
    if (!bulkPreviewDocs.length || bulkWorking) return;
    const fromLabel = roleConfigs?.[bulkFromRole]?.label || bulkFromRole;
    const toLabel = roleConfigs?.[bulkToRole]?.label || bulkToRole;

    if (!window.confirm(
      `Change ${bulkPreviewDocs.length} customer(s) from "${fromLabel}" to "${toLabel}"? This updates their role in Firestore and cannot be automatically undone.`
    )) return;

    setBulkWorking(true);
    setError('');
    setNotice('');
    let updated = 0;
    try {
      // Firestore batches allow at most 500 writes; keep a safety margin.
      for (let offset = 0; offset < bulkPreviewDocs.length; offset += 450) {
        const chunk = bulkPreviewDocs.slice(offset, offset + 450);
        const batch = writeBatch(db);
        chunk.forEach((customerDoc) => {
          batch.set(
            doc(db, 'users', customerDoc.id),
            { role: bulkToRole },
            { merge: true }
          );
        });
        await batch.commit();
        updated += chunk.length;
      }

      setBulkPreviewDocs([]);
      setNotice(`Successfully changed ${updated} customer(s) from ${fromLabel} to ${toLabel}.`);
      resetPageState();
      if (!activeSearch) {
        await loadPage('first');
      } else {
        // Reload the current search so customers no longer appear under the old role.
        setActiveSearch('');
        setSearchInput('');
        setRoleFilter('all');
      }
    } catch (err) {
      console.error('Bulk role update failed:', err);
      setError(
        `Bulk role update stopped after ${updated} customer(s). ${err.message || 'Some customers may already have been updated; preview again before retrying.'}`
      );
      setBulkPreviewDocs([]);
      if (!activeSearch) await loadPage('first');
    } finally {
      setBulkWorking(false);
    }
  };

  const dirtyCount = customers.filter((customer) => customer.dirty).length;

  const clearSearch = () => {
    setSearchInput('');
    setActiveSearch('');
  };

  return (
    <main className="customer-management">
      <header className="cm-header">
        <div className="cm-heading">
          <span className="cm-eyebrow">ADMIN CONSOLE / CUSTOMERS</span>
          <h1>Customer management</h1>
          <p>Search customers, adjust pricing roles, and manage minimum order values.</p>
        </div>

        <div className="cm-stats">
          <div className="cm-stat">
            <span>Results shown</span>
            <strong>{customers.length}</strong>
          </div>
          <div className="cm-stat">
            <span>Unsaved edits</span>
            <strong className={dirtyCount ? 'cm-dirty' : ''}>{dirtyCount}</strong>
          </div>
        </div>
      </header>

      <section className="cm-bulk-role-panel">
        <div className="cm-bulk-role-copy">
          <span className="cm-bulk-kicker"><span className="cm-bulk-dot" /> BULK ACTION</span>
          <h2>Bulk customer role change</h2>
          <p>Move every customer assigned to one role into another role. Customer details and custom minimum order values will be preserved.</p>
        </div>

        <div className="cm-bulk-controls">
          <label className="cm-field">
            <span>Current role</span>
            <select
              value={bulkFromRole}
              onChange={(event) => {
                setBulkFromRole(event.target.value);
                setBulkPreviewDocs([]);
              }}
              disabled={bulkWorking}
            >
              {roles.map((role) => (
                <option key={role} value={role}>{roleConfigs?.[role]?.label || role}</option>
              ))}
            </select>
          </label>

          <div className="cm-bulk-arrow" aria-hidden="true">→</div>

          <label className="cm-field">
            <span>Change to</span>
            <select
              value={bulkToRole}
              onChange={(event) => {
                setBulkToRole(event.target.value);
                setBulkPreviewDocs([]);
              }}
              disabled={bulkWorking}
            >
              {roles.map((role) => (
                <option key={role} value={role}>{roleConfigs?.[role]?.label || role}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="cm-btn cm-btn-light"
            onClick={previewBulkRoleChange}
            disabled={bulkWorking || !bulkFromRole || !bulkToRole || bulkFromRole === bulkToRole}
          >
            {bulkWorking ? 'Working...' : 'Preview customers'}
          </button>
        </div>

        {bulkPreviewDocs.length > 0 && (
          <div className="cm-bulk-preview">
            <div>
              <strong>{bulkPreviewDocs.length.toLocaleString('en-IN')} customers found</strong>
              <span>Review the source and target roles above before applying this change.</span>
            </div>
            <button
              type="button"
              className="cm-btn cm-btn-primary"
              onClick={applyBulkRoleChange}
              disabled={bulkWorking}
            >
              {bulkWorking ? 'Updating customers...' : `Confirm role change (${bulkPreviewDocs.length.toLocaleString('en-IN')})`}
            </button>
          </div>
        )}
      </section>

      <section className="cm-toolbar">
        <div className="cm-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={searchInput}
            placeholder="Search name, mobile, email, UID, address or country..."
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Search all customer fields"
          />
          {searchInput && (
            <button type="button" onClick={clearSearch} aria-label="Clear search">
              ×
            </button>
          )}
        </div>

        <label className="cm-filter">
          <span>Role filter</span>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="all">All roles</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {roleConfigs?.[role]?.label || role}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="cm-btn cm-btn-light"
          onClick={() => {
            setSearchInput('');
            setActiveSearch('');
            setRoleFilter('all');
          }}
        >
          Reset
        </button>

        <button
          type="button"
          className="cm-btn cm-btn-primary"
          disabled={savingId !== null || dirtyCount === 0}
          onClick={saveAll}
        >
          {savingId === 'all' ? 'Saving...' : `Save all${dirtyCount ? ` (${dirtyCount})` : ''}`}
        </button>
      </section>

      {error && (
        <div className="cm-alert cm-alert-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss">×</button>
        </div>
      )}

      {notice && (
        <div className="cm-alert cm-alert-success" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">×</button>
        </div>
      )}

      <section className="cm-panel">
        <div className="cm-panel-heading">
          <div>
            <h2>{activeSearch ? 'Search results' : 'Customer directory'}</h2>
            <p>
              {activeSearch
                ? 'Results from matching Firestore queries; maximum 50 shown.'
                : `Page ${page} · ${PAGE_SIZE} customers per page`}
            </p>
          </div>
          {(loading || searching) && (
            <span className="cm-loading"><i />{searching ? 'Searching' : 'Loading'}</span>
          )}
        </div>

        {loading && !activeSearch ? (
          <div className="cm-empty">
            <i className="cm-spinner" />
            <strong>Loading customer page</strong>
            <span>Retrieving only the current page.</span>
          </div>
        ) : customers.length === 0 ? (
          <div className="cm-empty">
            <div className="cm-empty-icon">⌕</div>
            <strong>No customers found</strong>
            <span>Try another name, phone number, UID, address or country.</span>
          </div>
        ) : (
          <div className="cm-list">
            {customers.map((customer) => {
              const defaultMinimum = Number(
                roleConfigs?.[customer.role]?.minOrderValue ?? 0
              );

              return (
                <article
                  className={`cm-customer ${customer.dirty ? 'cm-customer-dirty' : ''}`}
                  key={customer.id}
                >
                  <div className="cm-identity">
                    <div className="cm-avatar">
                      {customer.name.trim().charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="cm-identity-text">
                      <div className="cm-name-line">
                        <h3>{customer.name}</h3>
                        {customer.dirty && <span className="cm-unsaved">Unsaved</span>}
                      </div>
                      <p>{customer.email || 'No email'}</p>
                      {customer.phone && <p>{customer.phone}</p>}
                      {(customer.address || customer.country) && (
                        <p className="cm-address">
                          {[customer.address, customer.country].filter(Boolean).join(', ')}
                        </p>
                      )}
                      <small title={customer.uid}>UID: {customer.uid}</small>
                    </div>
                  </div>

                  <div className="cm-edit-grid">
                    <label className="cm-field">
                      <span>Customer role</span>
                      <select
                        value={customer.role}
                        onChange={(event) =>
                          updateCustomer(customer.id, 'role', event.target.value)
                        }
                      >
                        {roles.map((role) => (
                          <option key={role} value={role}>
                            {roleConfigs?.[role]?.label || role}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="cm-field">
                      <span>Custom minimum (₹)</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="decimal"
                        value={customer.minimumOrderValue}
                        placeholder={`Default: ${defaultMinimum}`}
                        onChange={(event) =>
                          updateCustomer(
                            customer.id,
                            'minimumOrderValue',
                            event.target.value
                          )
                        }
                      />
                    </label>

                    <div className="cm-effective">
                      <span>Effective minimum</span>
                      <strong>{money(effectiveMinimum(customer))}</strong>
                      <small>
                        {customer.minimumOrderValue === ''
                          ? 'Using role default'
                          : 'Custom override'}
                      </small>
                    </div>

                    <div className="cm-row-actions">
                      <button
                        type="button"
                        className="cm-btn cm-btn-light"
                        disabled={customer.minimumOrderValue === ''}
                        onClick={() =>
                          updateCustomer(customer.id, 'minimumOrderValue', '')
                        }
                      >
                        Use role default
                      </button>
                      <button
                        type="button"
                        className="cm-btn cm-btn-primary"
                        disabled={!customer.dirty || savingId !== null}
                        onClick={() => saveCustomer(customer)}
                      >
                        {savingId === customer.id ? 'Saving...' : 'Save customer'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!activeSearch ? (
          <footer className="cm-pagination">
            <span>Page {page}</span>
            <div>
              <button
                type="button"
                className="cm-btn cm-btn-light"
                disabled={page <= 1 || loading || savingId !== null}
                onClick={() => loadPage('previous')}
              >
                ← Previous
              </button>
              <button
                type="button"
                className="cm-btn cm-btn-light"
                disabled={!hasNext || loading || savingId !== null}
                onClick={() => loadPage('next')}
              >
                Next →
              </button>
            </div>
          </footer>
        ) : (
          <footer className="cm-search-footer">
            Partial matches require the customer search index. Clear the search to browse all customers page by page.
          </footer>
        )}
      </section>
    </main>
  );
}
