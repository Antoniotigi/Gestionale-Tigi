# Security Specification & Threat Model

This specification details the security invariants, validation rules, and threat models for the SmartGate event attendance application.

## 1. Data Invariants

1. **Event Invariants:**
   - An event cannot be created without a unique ID, non-empty title, and valid ISO-8601 start and end dates.
   - The event state (`status`) must be exactly `'active'`, `'completed'`, or `'draft'`.
   - String fields must not exceed pre-defined volumetric limits (e.g., description <= 2000 characters) to prevent "Denial of Wallet" size-poisoning.

2. **Participant Invariants:**
   - A participant must belong to a parent event subcollection.
   - The participant's `id` (Barcode) must be non-empty, strictly alphanumeric, and conform to the standard layout.
   - Both `firstName` and `lastName` must be provided and must not exceed 200 characters each.

3. **AttendanceLog Invariants:**
   - An attendance log must specify the correct `eventId` and `participantId`.
   - The status must be strictly `'inside'` or `'outside'`.
   - `checkInTime` is required on creation. `checkOutTime` is required when status is `'outside'`.

---

## 2. The "Dirty Dozen" Malicious Payloads

The following payloads attempt to violate security boundaries, inject excessive volumes, bypass validations, or hijack identity fields:

### Payload 1: Event Schema Poisoning (Extra Fields)
```json
{
  "id": "EVT-1",
  "title": "Hacker Meetup",
  "startDate": "2026-09-09T00:00:00.000Z",
  "endDate": "2026-09-09T10:00:00.000Z",
  "status": "active",
  "createdAt": "2026-09-09T00:00:00.000Z",
  "ghostField": "maliciousValue"
}
```

### Payload 2: Event State Hijacking (Invalid Status)
```json
{
  "id": "EVT-1",
  "title": "Hacker Meetup",
  "startDate": "2026-09-09T00:00:00.000Z",
  "endDate": "2026-09-09T10:00:00.000Z",
  "status": "super_active",
  "createdAt": "2026-09-09T00:00:00.000Z"
}
```

### Payload 3: Event Denial-of-Wallet (Title oversized)
```json
{
  "id": "EVT-1",
  "title": "A".repeat(1000),
  "startDate": "2026-09-09T00:00:00.000Z",
  "endDate": "2026-09-09T10:00:00.000Z",
  "status": "active",
  "createdAt": "2026-09-09T00:00:00.000Z"
}
```

### Payload 4: Orphaned Participant (No First Name)
```json
{
  "id": "05",
  "lastName": "Doe"
}
```

### Payload 5: Participant ID Injection (Path Poisoning with symbols)
```json
{
  "id": "ID_$$$_HACK",
  "firstName": "John",
  "lastName": "Doe"
}
```

### Payload 6: Participant Volumetric Poisoning (First Name size)
```json
{
  "id": "05",
  "firstName": "J".repeat(1000),
  "lastName": "Doe"
}
```

### Payload 7: Attendance Log Missing Event ID
```json
{
  "id": "LOG-1",
  "participantId": "05",
  "status": "inside",
  "checkInTime": "2026-09-09T00:00:00.000Z"
}
```

### Payload 8: Attendance Log Invalid Status
```json
{
  "id": "LOG-1",
  "eventId": "EVT-1",
  "participantId": "05",
  "status": "teleporting",
  "checkInTime": "2026-09-09T00:00:00.000Z"
}
```

### Payload 9: Attendance Log Giant String ID
```json
{
  "id": "A".repeat(1000),
  "eventId": "EVT-1",
  "participantId": "05",
  "status": "inside",
  "checkInTime": "2026-09-09T00:00:00.000Z"
}
```

### Payload 10: Attendance Log CheckOut Missing CheckOutTime
```json
{
  "id": "LOG-1",
  "eventId": "EVT-1",
  "participantId": "05",
  "status": "outside",
  "checkInTime": "2026-09-09T00:00:00.000Z",
  "checkOutTime": null
}
```

### Payload 11: Event Created At Spoofing
```json
{
  "id": "EVT-1",
  "title": "Hacker Meetup",
  "startDate": "2026-09-09T00:00:00.000Z",
  "endDate": "2026-09-09T10:00:00.000Z",
  "status": "active",
  "createdAt": "1999-01-01T00:00:00.000Z"
}
```

### Payload 12: Attendance Log Total Minutes Under Bounds
```json
{
  "id": "LOG-1",
  "eventId": "EVT-1",
  "participantId": "05",
  "status": "outside",
  "checkInTime": "2026-09-09T00:00:00.000Z",
  "checkOutTime": "2026-09-09T00:01:00.000Z",
  "totalMinutes": -10
}
```

---

## 3. The Test Plan

A separate verification logic tests these invariants to confirm security rules are perfectly locked.
All unauthorized lookups, schema variations, and type-poisoning actions will be rejected with `PERMISSION_DENIED`.
