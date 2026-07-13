/* =====================================================================
   MEETING BOOKING — the calendar button in every insight audit email
   links to a booking form; submissions land in the "Booked Prospects"
   tab. The form doubles as a quick discovery questionnaire so the first
   call is already half-researched. (In production the button opens this
   form hosted at /book/<campaign>.<contact>; in-app it's previewable and
   bookings are added straight to the scope store.) ---- */
import React, { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Mail, MapPin, Phone, Trash2, Users, X } from "lucide-react";
import { Card, Labeled, Modal, inputCls } from "../../ui/primitives.jsx";

const gid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const SLOTS = ["Morning (9–12)", "Midday (12–3)", "Afternoon (3–6)", "Evening (after 6)"];

/* the client-facing questionnaire + scheduler */
export function BookingForm({ accent, company, prefill = {}, onClose, onBook }) {
  const [d, setD] = useState({
    name: prefill.contactName || "", business: prefill.business || "", email: prefill.email || "", phone: "",
    cities: prefill.city || "", staff: "", leadsPerDay: "", goal: "", date: "", slot: SLOTS[0], notes: "",
  });
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const [done, setDone] = useState(false);
  const valid = d.name.trim() && d.business.trim() && /@/.test(d.email) && d.cities.trim() && d.date;
  const minDate = new Date(Date.now() + 864e5).toISOString().slice(0, 10);

  if (done) return (
    <Modal title="You're booked 🎉" onClose={onClose}>
      <div className="space-y-3 py-4 text-center">
        <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
        <div className="ll-display text-[16px] font-semibold">See you {new Date(d.date).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}, {d.slot.split(" (")[0].toLowerCase()}.</div>
        <p className="mx-auto max-w-sm text-[12.5px] text-gray-500">{company.name} will send a video-call link to <b>{d.email}</b>. We'll walk your map, profiles and site live and map the fastest path to more {prefill.category || "local"} leads.</p>
        <button onClick={onClose} className="rounded-lg px-5 py-2 text-[12.5px] font-semibold text-white" style={{ background: accent }}>Done</button>
      </div>
    </Modal>
  );

  return (
    <Modal title="Book your free strategy call" sub={`A 20-minute video call with ${company.name} — we'll show you exactly how to win more leads.`} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="rounded-xl p-3 text-[12px] leading-relaxed text-white" style={{ background: accent }}>
          <b>Come ready to win.</b> Tell us a little about your business below and we'll walk into the call already knowing your market — so every minute is spent on <i>your</i> growth, not paperwork.
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Your name *"><input value={d.name} onChange={set("name")} placeholder="Jordan Smith" className={inputCls} /></Labeled>
          <Labeled label="Business name *"><input value={d.business} onChange={set("business")} placeholder="Smith Roofing Co." className={inputCls} /></Labeled>
          <Labeled label="Email *"><input value={d.email} onChange={set("email")} placeholder="you@business.com" className={"ll-mono " + inputCls} /></Labeled>
          <Labeled label="Phone (optional)"><input value={d.phone} onChange={set("phone")} placeholder="(555) 123-4567" className={"ll-mono " + inputCls} /></Labeled>
        </div>
        <Labeled label="Which cities / areas do you serve? *"><input value={d.cities} onChange={set("cities")} placeholder="Austin, Round Rock, Cedar Park…" className={inputCls} /></Labeled>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="How many people on your team?"><input value={d.staff} inputMode="numeric" onChange={(e) => setD({ ...d, staff: e.target.value.replace(/\D/g, "") })} placeholder="e.g. 6" className={inputCls} /></Labeled>
          <Labeled label="How many new leads could you handle a day?"><input value={d.leadsPerDay} inputMode="numeric" onChange={(e) => setD({ ...d, leadsPerDay: e.target.value.replace(/\D/g, "") })} placeholder="e.g. 10" className={inputCls} /></Labeled>
        </div>
        <Labeled label="What would winning look like for you? (optional)">
          <textarea value={d.goal} onChange={set("goal")} rows={2} placeholder="Keep all 3 crews booked out · dominate the map in my city · stop relying on Angi leads…" className={inputCls + " resize-y"} />
        </Labeled>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Preferred date *"><input type="date" min={minDate} value={d.date} onChange={set("date")} className={inputCls} /></Labeled>
          <Labeled label="Preferred time">
            <select value={d.slot} onChange={set("slot")} className={inputCls + " bg-white"}>{SLOTS.map((s) => <option key={s}>{s}</option>)}</select>
          </Labeled>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-[12.5px] font-medium text-gray-600">Cancel</button>
          <button disabled={!valid} onClick={() => { onBook({ id: gid("bk"), ...d, ...prefill, bookedAt: Date.now(), status: "new" }); setDone(true); }}
            className="flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-40" style={{ background: accent }}>
            <CalendarClock size={14} /> Confirm my call
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ================= Booked Prospects tab ================= */
export function BookingsTab({ accent, company, store, commit }) {
  const bookings = store.bookings || [];
  const [preview, setPreview] = useState(false);
  const [open, setOpen] = useState(null);
  const sorted = useMemo(() => [...bookings].sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.bookedAt - b.bookedAt), [bookings]);
  const upcoming = sorted.filter((b) => !b.date || b.date >= new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="ll-display text-[15px] font-semibold">Booked prospects</div>
          <span className="text-[11px] text-gray-400">· {upcoming.length} upcoming · {bookings.length} total</span>
          <button onClick={() => setPreview(true)} className="ml-auto rounded-lg border border-gray-200 px-3 py-1.5 text-[11.5px] font-semibold text-gray-600">
            Preview / test the booking form
          </button>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-500">
          The <b>📅 Book my free strategy call</b> button in every insight audit email links to your booking form
          (<span className="ll-mono">/book/&lt;campaign&gt;.&lt;prospect&gt;</span> when the CRM is hosted). Every submission — with the prospect's cities,
          team size and daily-lead capacity — lands here so your first call is already half-researched.
        </div>
        {bookings.length === 0 && <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-[12px] text-gray-400">No bookings yet — they appear the moment a prospect confirms a call.</div>}
        <div className="space-y-2">
          {sorted.map((b) => (
            <button key={b.id} onClick={() => setOpen(b)} className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-gray-100 p-3 text-left hover:border-gray-200">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: accent }}>{(b.name || "?")[0]}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-gray-800">{b.business || b.name} <span className="font-normal text-gray-400">· {b.name}</span></span>
                <span className="block text-[10.5px] text-gray-400">{b.cities || "—"}{b.staff ? ` · ${b.staff} staff` : ""}{b.leadsPerDay ? ` · wants ${b.leadsPerDay} leads/day` : ""}</span>
              </span>
              <span className="ml-auto flex items-center gap-2 text-[11px]">
                {b.date && <span className="rounded-lg bg-emerald-50 px-2 py-1 font-bold text-emerald-700">{new Date(b.date).toLocaleDateString("en", { month: "short", day: "numeric" })} · {b.slot?.split(" (")[0]}</span>}
                <span onClick={(e) => { e.stopPropagation(); commit({ bookings: bookings.filter((x) => x.id !== b.id) }); }} className="rounded-md p-1 text-gray-300 hover:text-red-500"><Trash2 size={13} /></span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      {preview && <BookingForm accent={accent} company={company} prefill={{ category: "your", city: "" }}
        onClose={() => setPreview(false)} onBook={(bk) => { commit({ bookings: [bk, ...bookings] }); setPreview(false); }} />}

      {open && (
        <Modal title={open.business || open.name} sub={`Booked ${new Date(open.bookedAt).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`} onClose={() => setOpen(null)}>
          <div className="space-y-2.5 text-[13px]">
            {open.date && <div className="rounded-xl p-3 text-white" style={{ background: accent }}><CalendarClock size={14} className="mb-1 inline" /> <b>{new Date(open.date).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}</b> · {open.slot}</div>}
            {[["Contact", open.name, Users], ["Email", open.email, Mail], ["Phone", open.phone, Phone], ["Serves", open.cities, MapPin]].map(([l, v, Icon]) => v && (
              <div key={l} className="flex items-center gap-2"><Icon size={13} className="text-gray-400" /> <span className="text-gray-400">{l}:</span> <span className="font-medium text-gray-800">{v}</span></div>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {open.staff && <div className="rounded-lg bg-gray-50 p-2.5 text-center"><div className="ll-mono text-[18px] font-bold text-gray-800">{open.staff}</div><div className="text-[9.5px] uppercase text-gray-400">team size</div></div>}
              {open.leadsPerDay && <div className="rounded-lg bg-gray-50 p-2.5 text-center"><div className="ll-mono text-[18px] font-bold text-gray-800">{open.leadsPerDay}</div><div className="text-[9.5px] uppercase text-gray-400">leads/day wanted</div></div>}
            </div>
            {open.goal && <div className="rounded-xl bg-amber-50 p-3 text-[12px] text-amber-900"><b>Their goal:</b> {open.goal}</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
