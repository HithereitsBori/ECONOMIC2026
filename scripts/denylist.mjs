// LEGACY_DENYLIST: identifiers of the template project (GCNT guide book) this code was derived from.
// Strings that must never appear in this public repo's source or in any build output.
// This is the ONLY file exempt from the source scan.
export const LEGACY_DENYLIST = [
  '2PACX-1vSPsJy5i', 'G-XHRMQRXY9F', '1FAIpQLSc-jgkng', 'gcnt2026', 'GCNT', 'True Digital Park',
  'MOCK_SCHEDULE', 'MOCK_BOOTHS', 'Speakers_Mod', 'SideStage_Speaker_mod', 'Workshop_Speaker_mod',
  'From Shock To Shift', 'gcnt-index',
];

// Present only in the staff build. Any hit in the attendee build is a leak.
export const STAFF_MARKERS = [
  '@if staff', 'data-audience="staff"', 'id="staff-faq"', 'staffFaq', 'audience/staff',
  'STAFF ONLY', 'STAFF_FIXTURE_QUESTION', 'faq-staff',
];

// Internal provenance columns of the private draft sheet; never in any output.
export const INTERNAL_COLUMNS = ['doc_revision_id', 'review_notes', 'hold_reason', 'doc_marker'];

// Facts we must not invent before the organiser confirms them (spec: no fake venue answers).
export const UNCONFIRMED_VENUE_TERMS = ['ห้องน้ำ', 'ที่จอดรถ', 'ปั๊มบัตร', 'น้ำดื่ม'];
