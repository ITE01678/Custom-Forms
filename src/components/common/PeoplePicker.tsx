import { useEffect, useRef, useState } from "react";
import { searchUsers, type EntraProfile } from "../../services/users";
import { initialsOf } from "../../lib/initials";

interface Props {
  value: string;
  onChange: (email: string) => void;
  /** Fired when the person picks a directory suggestion — callers use this
   *  to also capture the real display name (AccessControlPanel/
   *  ManageRolesPage both want it for nicer display), separately from the
   *  raw typed-text onChange. */
  onSelect?: (user: { email: string; displayName: string }) => void;
  placeholder?: string;
}

/** Email input with a live directory-search dropdown — this app already
 *  has User.Read.All (used for autofill/connector lookups), so typing a
 *  name or partial address here can suggest a real colleague instead of
 *  requiring their exact email typed blind. Picking a suggestion is a
 *  convenience, not a requirement — a typed address that matches no one is
 *  still accepted (the caller's own validation, e.g. the org-domain check,
 *  still runs independently). */
export function PeoplePicker({ value, onChange, onSelect, placeholder }: Props) {
  const [results, setResults] = useState<EntraProfile[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = value.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const thisRequest = ++requestIdRef.current;
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      searchUsers(query)
        .then((users) => {
          if (requestIdRef.current === thisRequest) setResults(users);
        })
        .catch(() => {
          if (requestIdRef.current === thisRequest) setResults([]);
        })
        .finally(() => {
          if (requestIdRef.current === thisRequest) setSearching(false);
        });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  function handlePick(user: EntraProfile) {
    const email = (user.mail ?? user.userPrincipalName).toLowerCase();
    onChange(email);
    onSelect?.({ email, displayName: user.displayName });
    setOpen(false);
    setResults([]);
  }

  return (
    <div className="people-picker" ref={containerRef}>
      <input
        type="email"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && value.trim().length >= 2 && (searching || results.length > 0) && (
        <div className="people-picker__dropdown" role="listbox">
          {searching && results.length === 0 ? (
            <div className="people-picker__status">Searching…</div>
          ) : (
            results.map((user) => (
              <button
                type="button"
                key={user.id}
                className="people-picker__option"
                onClick={() => handlePick(user)}
              >
                <span className="people-picker__avatar" aria-hidden="true">
                  {initialsOf(user.displayName) || "?"}
                </span>
                <span className="people-picker__info">
                  <span className="people-picker__name">{user.displayName}</span>
                  <span className="people-picker__email">{user.mail ?? user.userPrincipalName}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
