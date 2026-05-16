import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase";

const C = {
  bg: "#0a0a0a",
  sidebar: "#111111",
  card: "#1a1a1a",
  cardHover: "#222222",
  border: "#2a2a2a",
  accent: "#3ecfaa",
  accentDark: "#0d2e1f",
  textPrimary: "#f0f0f0",
  textSecondary: "#888888",
  textTertiary: "#555555",
  badgeAtivo: { bg: "#0d2e1f", text: "#3ecfaa" },
  badgePausado: { bg: "#2e2000", text: "#f0a500" },
  badgeEncerrado: { bg: "#2e0d0d", text: "#e05555" },
  badgeCancelado: { bg: "#2e0d0d", text: "#e05555" },
  badgeProspecto: { bg: "#0d1a2e", text: "#4a9eff" },
  badgeFixo: { bg: "#0d2e1f", text: "#3ecfaa" },
  badgeVariavel: { bg: "#1f1635", text: "#c084fc" },
};

const NAV = [
  { icon: "ti-layout-dashboard", label: "Dashboard geral", key: "dashboard" },
  { icon: "ti-users", label: "Clientes fixos", key: "fixed" },
  { icon: "ti-arrows-exchange", label: "Renda variável", key: "variable" },
  { icon: "ti-calendar-stats", label: "Anual", key: "annual" },
];

const STATUS_FILTERS = ["Todos", "Ativo", "Pausado", "Encerrado", "Cancelado", "Prospecto"];
const BILLING_MODELS = [
  { value: "fixed", label: "Fixo" },
  { value: "variable", label: "Variável por demanda" },
];

const MONTHS = [
  { key: "01", label: "Jan" },
  { key: "02", label: "Fev" },
  { key: "03", label: "Mar" },
  { key: "04", label: "Abr" },
  { key: "05", label: "Mai" },
  { key: "06", label: "Jun" },
  { key: "07", label: "Jul" },
  { key: "08", label: "Ago" },
  { key: "09", label: "Set" },
  { key: "10", label: "Out" },
  { key: "11", label: "Nov" },
  { key: "12", label: "Dez" },
];

function safeFileName(fileName) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

async function createSignedUrl(bucket, path) {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);

  if (error) {
    console.error(`Erro ao gerar link temporário do bucket ${bucket}:`, error);
    return null;
  }

  return data.signedUrl;
}

async function uploadFileToStorage({ bucket, userId, recordId, file }) {
  if (!file) return { path: null };

  const path = `${userId}/${recordId}/${Date.now()}-${safeFileName(file.name)}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || "application/octet-stream",
  });

  if (error) throw error;

  return { path };
}

function brl(value) {
  return `R$ ${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeBillingModel(value) {
  return value === "variable" ? "variable" : "fixed";
}

function getBillingLabel(model) {
  return normalizeBillingModel(model) === "variable" ? "Variável" : "Fixo";
}

function getPaymentsForYear(client, year) {
  const payments = client?.monthlyPayments || {};
  return payments[String(year)] || {};
}

function sumPaymentsForYear(client, year) {
  const payments = getPaymentsForYear(client, year);
  return MONTHS.reduce((sum, month) => sum + Number(payments[month.key] || 0), 0);
}

function averagePaymentsForYear(client, year) {
  const payments = getPaymentsForYear(client, year);
  const values = MONTHS.map((month) => Number(payments[month.key] || 0)).filter((value) => value > 0);

  if (!values.length) return Number(client.value || 0);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function estimatedMonthlyValue(client, year = new Date().getFullYear()) {
  if (normalizeBillingModel(client.billingModel) === "variable") return averagePaymentsForYear(client, year);
  return Number(client.value || 0);
}

function contractAge(startDate) {
  if (!startDate) return null;

  const start = new Date(`${startDate}T00:00:00`);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 1) return "< 1 mês de contrato";
  if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"} de contrato`;

  const years = Math.floor(months / 12);
  const rem = months % 12;

  if (rem === 0) return `${years} ${years === 1 ? "ano" : "anos"} de contrato`;
  return `${years}a ${rem}m de contrato`;
}

function parseDate(date) {
  if (!date) return null;
  return new Date(`${date}T00:00:00`);
}

function clientTouchedYear(client, year) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const start = parseDate(client.startDate);
  const end = parseDate(client.endDate);
  const hasVariablePayment = sumPaymentsForYear(client, year) > 0;

  if (hasVariablePayment) return true;
  if (!start) return false;
  if (start > yearEnd) return false;
  if (end && end < yearStart) return false;
  return true;
}

function countActiveMonthsInYear(client, year) {
  const start = parseDate(client.startDate);
  if (!start) return 0;

  const now = new Date();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const capDate = year === now.getFullYear() ? now : yearEnd;
  const end = parseDate(client.endDate) || capDate;
  const from = start > yearStart ? start : yearStart;
  const to = end < capDate ? end : capDate;

  if (from > to) return 0;

  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
}

function Badge({ status }) {
  const m = {
    Ativo: C.badgeAtivo,
    Pausado: C.badgePausado,
    Encerrado: C.badgeEncerrado,
    Cancelado: C.badgeCancelado,
    Prospecto: C.badgeProspecto,
  };
  const s = m[status] || m.Ativo;

  return (
    <span style={{ background: s.bg, color: s.text, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>
      {status}
    </span>
  );
}

function BillingBadge({ billingModel }) {
  const isVariable = normalizeBillingModel(billingModel) === "variable";
  const s = isVariable ? C.badgeVariavel : C.badgeFixo;

  return (
    <span style={{ background: s.bg, color: s.text, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.4 }}>
      {isVariable ? "Variável" : "Fixo"}
    </span>
  );
}

function Avatar({ name = "Cliente", logo, size = 38 }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `1.5px solid ${C.border}` }}
      />
    );
  }

  const cols = ["#0d2e1f", "#0d1a2e", "#2e2000", "#1a1a2e", "#0d2020"];
  const tc = ["#3ecfaa", "#4a9eff", "#f0a500", "#c084fc", "#5eead4"];
  const i = name.charCodeAt(0) % cols.length;
  const init = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: cols[i],
        color: tc[i],
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.35,
        fontWeight: 700,
        flexShrink: 0,
        border: `1.5px solid ${C.border}`,
      }}
    >
      {init}
    </div>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px", flex: 1, minWidth: 0 }}>
      <div style={{ color: C.textTertiary, fontSize: 11, fontWeight: 500, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
      <div style={{ color: C.accent, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ color: C.textTertiary, fontSize: 11, marginTop: 8 }}>{hint}</div>}
    </div>
  );
}

function FilterPanel({ filters, setFilters, onClose, cities }) {
  const [local, setLocal] = useState({ ...filters });
  const toggle = (k, v) => setLocal((f) => ({ ...f, [k]: f[k] === v ? "" : v }));
  const cityOptions = cities.length ? cities : ["São Paulo", "Rio de Janeiro", "Curitiba", "Belo Horizonte", "Barueri"];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }} />
      <div style={{ position: "fixed", top: 78, right: 24, width: 300, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, zIndex: 50, padding: 20, animation: "slideDown 150ms ease" }}>
        <style>{`@keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ color: C.textPrimary, fontWeight: 700, fontSize: 13 }}>Filtros avançados</span>
          <button onClick={() => { setFilters({ type: "", location: "" }); onClose(); }} style={{ background: "none", border: "none", color: C.textTertiary, cursor: "pointer", fontSize: 11, fontFamily: "Inter,sans-serif" }}>Limpar</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ color: C.textTertiary, fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>Periodicidade do contrato</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["Semanal", "Mensal", "Trimestral", "Semestral", "Anual"].map((o) => (
              <button key={o} onClick={() => toggle("type", o)} style={{ padding: "4px 12px", borderRadius: 20, border: `1px solid ${local.type === o ? C.accent : C.border}`, background: local.type === o ? C.accentDark : "transparent", color: local.type === o ? C.accent : C.textSecondary, fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 150ms", fontFamily: "Inter,sans-serif" }}>{o}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ color: C.textTertiary, fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>Localização</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {cityOptions.map((o) => (
              <button key={o} onClick={() => toggle("location", o)} style={{ padding: "4px 12px", borderRadius: 20, border: `1px solid ${local.location === o ? C.accent : C.border}`, background: local.location === o ? C.accentDark : "transparent", color: local.location === o ? C.accent : C.textSecondary, fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 150ms", fontFamily: "Inter,sans-serif" }}>{o}</button>
            ))}
          </div>
        </div>

        <button onClick={() => { setFilters(local); onClose(); }} style={{ width: "100%", padding: "9px 0", borderRadius: 8, background: C.accent, border: "none", color: "#0a0a0a", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "Inter,sans-serif" }}>Aplicar filtros</button>
      </div>
    </>
  );
}

const iStyle = {
  width: "100%",
  background: "#111111",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "9px 12px",
  color: C.textPrimary,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "Inter,sans-serif",
};

function DrawerField({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: "block", color: C.textTertiary, fontSize: 11, fontWeight: 500, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</label>
      {children}
      {hint && <div style={{ color: C.textTertiary, fontSize: 11, marginTop: 5, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

function MonthlyPaymentsFields({ form, setForm, paymentYear, setPaymentYear }) {
  const yearKey = String(paymentYear);
  const currentPayments = form.monthlyPayments?.[yearKey] || {};

  const setMonthlyPayment = (monthKey, value) => {
    setForm((current) => ({
      ...current,
      monthlyPayments: {
        ...(current.monthlyPayments || {}),
        [yearKey]: {
          ...((current.monthlyPayments || {})[yearKey] || {}),
          [monthKey]: value,
        },
      },
    }));
  };

  const total = MONTHS.reduce((sum, month) => sum + Number(currentPayments[month.key] || 0), 0);
  const avg = averagePaymentsForYear({ ...form, monthlyPayments: form.monthlyPayments || {} }, paymentYear);

  return (
    <div style={{ background: "#0d0d0d", border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12 }}>
        <div>
          <div style={{ color: C.textPrimary, fontSize: 13, fontWeight: 700 }}>Pagamentos mensais</div>
          <div style={{ color: C.textTertiary, fontSize: 11, marginTop: 3 }}>Use para clientes de cobrança variável.</div>
        </div>
        <select style={{ ...iStyle, width: 94 }} value={paymentYear} onChange={(e) => setPaymentYear(Number(e.target.value))}>
          {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {MONTHS.map((month) => (
          <div key={month.key}>
            <label style={{ display: "block", color: C.textTertiary, fontSize: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>{month.label}</label>
            <input
              style={{ ...iStyle, padding: "8px 9px", fontSize: 12 }}
              type="number"
              min="0"
              value={currentPayments[month.key] || ""}
              onChange={(e) => setMonthlyPayment(month.key, e.target.value)}
              placeholder="0"
            />
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
          <div style={{ color: C.textTertiary, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Recebido no ano</div>
          <div style={{ color: C.accent, fontSize: 15, fontWeight: 800, marginTop: 4 }}>{brl(total)}</div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
          <div style={{ color: C.textTertiary, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Média mensal</div>
          <div style={{ color: C.accent, fontSize: 15, fontWeight: 800, marginTop: 4 }}>{brl(avg)}</div>
        </div>
      </div>
    </div>
  );
}

function Drawer({ client, onClose, onSave, saving, defaultBillingModel = "fixed" }) {
  const currentYear = new Date().getFullYear();
  const empty = {
    name: "",
    instagram: "",
    cnpj: "",
    company: "",
    responsible: "",
    cargo: "",
    email: "",
    phone: "",
    city: "",
    state: "",
    country: "BR",
    type: "Mensal",
    value: "",
    billingModel: defaultBillingModel,
    monthlyPayments: {},
    startDate: "",
    endDate: "",
    status: "Ativo",
    notes: "",
    logo: null,
    logoPath: null,
    logoFile: null,
    pdfFile: null,
    pdfName: null,
    pdfPath: null,
    pdfUploadFile: null,
  };

  const [form, setForm] = useState(client && Object.keys(client).length ? { ...client } : empty);
  const [paymentYear, setPaymentYear] = useState(currentYear);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const logoRef = useRef();
  const pdfRef = useRef();
  const isEdit = !!(client && Object.keys(client).length && client.id);
  const isVariable = normalizeBillingModel(form.billingModel) === "variable";
  const shouldShowEndDate = ["Pausado", "Encerrado", "Cancelado"].includes(form.status);

  const handleStatusChange = (status) => {
    setForm((f) => ({ ...f, status, endDate: ["Ativo", "Prospecto"].includes(status) ? "" : f.endDate }));
  };

  const handleLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const r = new FileReader();
    r.onload = (ev) => setForm((f) => ({ ...f, logo: ev.target.result, logoFile: file }));
    r.readAsDataURL(file);
  };

  const handlePDF = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Envie apenas arquivos PDF.");
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setForm((f) => ({ ...f, pdfFile: localUrl, pdfName: file.name, pdfUploadFile: file }));
  };

  const openPDF = () => {
    if (!form.pdfFile) return;
    window.open(form.pdfFile, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 40 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 460, background: "#111111", borderLeft: `1px solid ${C.border}`, zIndex: 50, overflowY: "auto", padding: "28px 24px", animation: "slideIn 200ms ease", fontFamily: "Inter,sans-serif" }}>
        <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-pencil" style={{ color: C.accent, fontSize: 16 }} />
            <h2 style={{ color: C.textPrimary, fontSize: 15, fontWeight: 700, margin: 0 }}>
              {isEdit ? "Editar cliente" : isVariable ? "Novo cliente variável" : "Novo cliente fixo"}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textSecondary, cursor: "pointer", fontSize: 20 }}><i className="ti ti-x" /></button>
        </div>

        <DrawerField label="Logo / Foto">
          <div onClick={() => logoRef.current.click()} style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: "14px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", background: "#0d0d0d" }}>
            {form.logo ? <img src={form.logo} alt="logo" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} /> : <><i className="ti ti-photo-up" style={{ color: C.textTertiary, fontSize: 24 }} /><span style={{ color: C.textTertiary, fontSize: 12 }}>Clique para upload</span></>}
          </div>
          <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogo} />
        </DrawerField>

        <DrawerField label="Modelo de cobrança">
          <select style={iStyle} value={form.billingModel || "fixed"} onChange={(e) => set("billingModel", e.target.value)}>
            {BILLING_MODELS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
          </select>
        </DrawerField>

        <DrawerField label="Nome do cliente"><input style={iStyle} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex: Dra. Ana Beatriz" /></DrawerField>
        <DrawerField label="Instagram"><input style={iStyle} value={form.instagram || ""} onChange={(e) => set("instagram", e.target.value)} placeholder="@cliente" /></DrawerField>
        <DrawerField label="CNPJ"><input style={iStyle} value={form.cnpj || ""} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" /></DrawerField>
        <DrawerField label="Responsável"><input style={iStyle} value={form.responsible || ""} onChange={(e) => set("responsible", e.target.value)} /></DrawerField>
        <DrawerField label="Cargo"><input style={iStyle} value={form.cargo || ""} onChange={(e) => set("cargo", e.target.value)} /></DrawerField>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <DrawerField label="E-mail"><input style={iStyle} value={form.email || ""} onChange={(e) => set("email", e.target.value)} /></DrawerField>
          <DrawerField label="Telefone"><input style={iStyle} value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} /></DrawerField>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px", gap: 10 }}>
          <DrawerField label="Cidade"><input style={iStyle} value={form.city || ""} onChange={(e) => set("city", e.target.value)} /></DrawerField>
          <DrawerField label="Estado"><input style={iStyle} value={form.state || ""} onChange={(e) => set("state", e.target.value)} placeholder="SP" /></DrawerField>
          <DrawerField label="País"><input style={iStyle} value={form.country || "BR"} onChange={(e) => set("country", e.target.value)} /></DrawerField>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <DrawerField label="Periodicidade">
            <select style={iStyle} value={form.type || "Mensal"} onChange={(e) => set("type", e.target.value)}>
              {["Semanal", "Mensal", "Trimestral", "Semestral", "Anual"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </DrawerField>
          <DrawerField label={isVariable ? "Valor estimado mensal" : "Valor mensal fixo"} hint={isVariable ? "Use como referência caso ainda não tenha pagamentos lançados." : undefined}>
            <input style={iStyle} type="number" value={form.value || ""} onChange={(e) => set("value", e.target.value)} />
          </DrawerField>
        </div>

        {isVariable && <MonthlyPaymentsFields form={form} setForm={setForm} paymentYear={paymentYear} setPaymentYear={setPaymentYear} />}

        <DrawerField label="Data de início"><input style={iStyle} type="date" value={form.startDate || ""} onChange={(e) => set("startDate", e.target.value)} /></DrawerField>

        <DrawerField label="Status">
          <select style={iStyle} value={form.status || "Ativo"} onChange={(e) => handleStatusChange(e.target.value)}>
            {["Ativo", "Pausado", "Encerrado", "Cancelado", "Prospecto"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </DrawerField>

        {shouldShowEndDate && (
          <DrawerField label={form.status === "Pausado" ? "Data da pausa" : "Data de término"}>
            <input style={iStyle} type="date" value={form.endDate || ""} onChange={(e) => set("endDate", e.target.value)} />
          </DrawerField>
        )}

        <DrawerField label="Observações"><textarea style={{ ...iStyle, resize: "vertical", minHeight: 64 }} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></DrawerField>

        <DrawerField label="Contrato em PDF">
          {form.pdfFile ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#0d0d0d", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
              <i className="ti ti-file-text" style={{ color: C.accent, fontSize: 18, flexShrink: 0 }} />
              <span style={{ color: C.textSecondary, fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.pdfName}</span>
              <button onClick={openPDF} style={{ background: C.accentDark, border: "none", color: C.accent, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "Inter,sans-serif", flexShrink: 0 }}>Ver contrato</button>
              <button onClick={() => setForm((f) => ({ ...f, pdfFile: null, pdfName: null, pdfUploadFile: null, pdfPath: null }))} style={{ background: "none", border: "none", color: C.textTertiary, cursor: "pointer", fontSize: 16 }}><i className="ti ti-x" /></button>
            </div>
          ) : (
            <div onClick={() => pdfRef.current.click()} style={{ border: `1px dashed ${C.border}`, borderRadius: 8, padding: "14px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", background: "#0d0d0d" }}>
              <i className="ti ti-upload" style={{ color: C.textTertiary, fontSize: 22 }} />
              <span style={{ color: C.textTertiary, fontSize: 12 }}>Clique para fazer upload do PDF</span>
            </div>
          )}
          <input ref={pdfRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={handlePDF} />
        </DrawerField>

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button disabled={saving} onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 8, background: "none", border: `1px solid ${C.border}`, color: C.textSecondary, fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontFamily: "Inter,sans-serif" }}>Cancelar</button>
          <button disabled={saving} onClick={() => onSave(form)} style={{ flex: 2, padding: "11px 0", borderRadius: 8, background: saving ? "#1e6b58" : C.accent, border: "none", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "Inter,sans-serif" }}>{saving ? "Salvando..." : "Salvar cliente"}</button>
        </div>
      </div>
    </>
  );
}

function ClientCard({ client, onClick, onDelete, currentYear, deletingId }) {
  const [hov, setHov] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const age = contractAge(client.startDate);
  const isVariable = normalizeBillingModel(client.billingModel) === "variable";
  const monthlyEstimate = estimatedMonthlyValue(client, currentYear);
  const isDeleting = deletingId === client.id;

  return (
    <div
      onClick={() => onClick(client)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: hov ? C.cardHover : C.card, border: `1px solid ${hov ? C.accent + "44" : C.border}`, borderRadius: 12, padding: "16px 18px", cursor: isDeleting ? "wait" : "pointer", transition: "all 200ms ease", display: "flex", flexDirection: "column", gap: 11, position: "relative", opacity: isDeleting ? 0.65 : 1 }}
    >
      <button
        type="button"
        aria-label="Opções do cliente"
        onClick={(e) => {
          e.stopPropagation();
          if (!isDeleting) setMenuOpen((open) => !open);
        }}
        style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 8, border: `1px solid ${menuOpen ? C.accent + "66" : "transparent"}`, background: menuOpen ? "#111111" : "transparent", color: C.textTertiary, cursor: isDeleting ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, zIndex: 3 }}
      >
        <i className="ti ti-dots-vertical" />
      </button>

      {menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", top: 42, right: 10, minWidth: 154, background: "#111111", border: `1px solid ${C.border}`, borderRadius: 10, padding: 6, boxShadow: "0 14px 40px rgba(0,0,0,0.35)", zIndex: 5 }}
        >
          <button
            type="button"
            disabled={isDeleting}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              onDelete(client);
            }}
            style={{ width: "100%", background: "transparent", border: "none", borderRadius: 8, padding: "9px 10px", color: C.badgeEncerrado.text, cursor: isDeleting ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, fontFamily: "Inter,sans-serif", textAlign: "left" }}
          >
            <i className="ti ti-trash" style={{ fontSize: 15 }} />
            {isDeleting ? "Excluindo..." : "Excluir cliente"}
          </button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Avatar name={client.name} logo={client.logo} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.textPrimary, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client.name}</div>
          {client.instagram && <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>{client.instagram}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, marginRight: 22 }}>
          <Badge status={client.status} />
          <BillingBadge billingModel={client.billingModel} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 5, columnGap: 12, fontSize: 12 }}>
        <span style={{ color: C.textTertiary }}>Responsável</span><span style={{ color: C.textSecondary, textAlign: "right" }}>{client.responsible}</span>
        <span style={{ color: C.textTertiary }}>Cidade</span><span style={{ color: C.textSecondary, textAlign: "right" }}>{client.city}{client.state ? `, ${client.state}` : ""}</span>
        <span style={{ color: C.textTertiary }}>Cobrança</span><span style={{ color: C.textSecondary, textAlign: "right" }}>{getBillingLabel(client.billingModel)}</span>
        <span style={{ color: C.textTertiary }}>{isVariable ? "Média/mês" : "Valor/mês"}</span><span style={{ color: C.accent, fontWeight: 700, textAlign: "right" }}>{brl(monthlyEstimate)}</span>
        {age && <><span style={{ color: C.textTertiary }}>Tempo</span><span style={{ color: "#4a9eff", fontWeight: 500, textAlign: "right" }}>{age}</span></>}
      </div>
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const action = mode === "login"
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password });

    const { error } = await action;

    if (error) {
      setMessage(error.message);
    } else if (mode === "signup") {
      setMessage("Cadastro criado. Se a confirmação por e-mail estiver ativa no Supabase, confirme seu e-mail antes de entrar.");
    }

    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter,sans-serif", color: C.textPrimary, padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 390, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.accentDark, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
          <i className="ti ti-lock" style={{ fontSize: 22 }} />
        </div>
        <h1 style={{ fontSize: 22, margin: "0 0 8px", color: C.textPrimary }}>{mode === "login" ? "Entrar no CRM" : "Criar acesso"}</h1>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: C.textSecondary, margin: "0 0 18px" }}>Use seu e-mail e senha para acessar seus clientes, logos e contratos salvos no Supabase.</p>

        <DrawerField label="E-mail">
          <input type="email" required style={iStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
        </DrawerField>
        <DrawerField label="Senha">
          <input type="password" required minLength={6} style={iStyle} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 6 caracteres" />
        </DrawerField>

        {message && <div style={{ background: "#111", border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 8, padding: 10, fontSize: 12, marginBottom: 12 }}>{message}</div>}

        <button disabled={loading} type="submit" style={{ width: "100%", padding: "11px 0", borderRadius: 8, background: loading ? "#1e6b58" : C.accent, border: "none", color: "#0a0a0a", fontSize: 13, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", fontFamily: "Inter,sans-serif" }}>
          {loading ? "Processando..." : mode === "login" ? "Entrar" : "Criar conta"}
        </button>

        <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")} style={{ width: "100%", marginTop: 12, background: "transparent", border: "none", color: C.accent, fontSize: 12, cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
          {mode === "login" ? "Ainda não tenho acesso" : "Já tenho acesso"}
        </button>
      </form>
    </div>
  );
}

function AnnualDashboard({ clients }) {
  const year = new Date().getFullYear();
  const clientsThisYear = clients.filter((client) => clientTouchedYear(client, year));
  const fixedClients = clients.filter((client) => normalizeBillingModel(client.billingModel) === "fixed");
  const variableClients = clients.filter((client) => normalizeBillingModel(client.billingModel) === "variable");

  const fixedActiveMrr = fixedClients
    .filter((client) => client.status === "Ativo")
    .reduce((sum, client) => sum + Number(client.value || 0), 0);

  const fixedGeneratedYear = fixedClients.reduce((sum, client) => {
    if (client.status === "Prospecto") return sum;
    return sum + countActiveMonthsInYear(client, year) * Number(client.value || 0);
  }, 0);

  const variableReceivedYear = variableClients.reduce((sum, client) => sum + sumPaymentsForYear(client, year), 0);
  const grossRevenueYear = fixedGeneratedYear + variableReceivedYear;
  const cities = new Set(clientsThisYear.map((client) => client.city).filter(Boolean));
  const countries = new Set(clientsThisYear.map((client) => client.country || "BR").filter(Boolean));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 18 }}>
        <MetricCard label={`Receita bruta ${year}`} value={brl(grossRevenueYear)} hint="Fixo realizado + variável lançado" />
        <MetricCard label="MRR fixo atual" value={brl(fixedActiveMrr)} hint="Clientes fixos ativos" />
        <MetricCard label="ARR projetado" value={brl(fixedActiveMrr * 12)} hint="MRR fixo atual x 12" />
        <MetricCard label="Clientes no ano" value={clientsThisYear.length} hint="Clientes com contrato ou pagamento no ano" />
        <MetricCard label="Variável recebido" value={brl(variableReceivedYear)} hint={`Pagamentos lançados em ${year}`} />
        <MetricCard label="Cidades atendidas" value={cities.size} />
        <MetricCard label="Países atendidos" value={countries.size} />
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <i className="ti ti-info-circle" style={{ color: C.accent, fontSize: 18 }} />
          <div style={{ color: C.textPrimary, fontWeight: 700, fontSize: 14 }}>Como estes números são calculados</div>
        </div>
        <p style={{ color: C.textSecondary, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          A receita bruta do ano soma os meses já percorridos dos clientes fixos com os pagamentos lançados nos clientes variáveis. O ARR projetado usa apenas o MRR fixo atual para não misturar receita garantida com demanda variável.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [filter, setFilter] = useState("Ativo");
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState([]);
  const [drawer, setDrawer] = useState(null);
  const [showFilter, setShowFilter] = useState(false);
  const [advFilters, setAdvFilters] = useState({ type: "", location: "" });
  const [sidebarLogo, setSidebarLogo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [loadingClients, setLoadingClients] = useState(false);
  const logoUploadRef = useRef();

  const user = session?.user;
  const currentYear = new Date().getFullYear();
  const activeFilterCount = Object.values(advFilters).filter(Boolean).length;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setAuthLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const savedLogo = window.localStorage.getItem("crm_sidebar_logo");
    if (savedLogo) setSidebarLogo(savedLogo);
  }, []);

  useEffect(() => {
    if (user) loadClients();
    else setClients([]);
  }, [user?.id]);

  async function loadClients() {
    if (!user) return;

    setLoadingClients(true);

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao buscar clientes:", error);
      alert("Erro ao buscar clientes. Confira as políticas RLS e o console.");
      setLoadingClients(false);
      return;
    }

    const mapped = await Promise.all((data || []).map(async (c) => {
      const logoUrl = await createSignedUrl("client-logos", c.logo_path);
      const contractUrl = await createSignedUrl("contracts", c.contract_path);

      return {
        id: c.id,
        name: c.name || "",
        instagram: c.instagram || "",
        cnpj: c.cnpj || "",
        company: c.company || "",
        responsible: c.responsible || "",
        cargo: c.cargo || "",
        email: c.email || "",
        phone: c.phone || "",
        city: c.city || "",
        state: c.state || "",
        country: c.country || "BR",
        type: c.type || "Mensal",
        value: c.value || 0,
        billingModel: normalizeBillingModel(c.billing_model),
        monthlyPayments: c.monthly_payments || {},
        status: c.status || "Ativo",
        startDate: c.start_date || "",
        endDate: c.end_date || "",
        notes: c.notes || "",
        logo: logoUrl,
        logoPath: c.logo_path || null,
        pdfFile: contractUrl,
        pdfName: c.contract_name || null,
        pdfPath: c.contract_path || null,
      };
    }));

    setClients(mapped);
    setLoadingClients(false);
  }

  const viewClients = useMemo(() => {
    if (activeNav === "fixed") return clients.filter((client) => normalizeBillingModel(client.billingModel) === "fixed");
    if (activeNav === "variable") return clients.filter((client) => normalizeBillingModel(client.billingModel) === "variable");
    return clients;
  }, [clients, activeNav]);

  const filtered = viewClients.filter((c) => {
    const mStatus = filter === "Todos" || c.status === filter;
    const term = search.toLowerCase();
    const mSearch = !term || c.name.toLowerCase().includes(term) || (c.company || "").toLowerCase().includes(term) || (c.instagram || "").toLowerCase().includes(term) || (c.cnpj || "").toLowerCase().includes(term);
    const mType = !advFilters.type || c.type === advFilters.type;
    const mLoc = !advFilters.location || c.city === advFilters.location;
    return mStatus && mSearch && mType && mLoc;
  });

  const cities = Array.from(new Set(viewClients.map((c) => c.city).filter(Boolean))).sort();
  const ativos = viewClients.filter((c) => c.status === "Ativo").length;
  const mrrEstimated = viewClients
    .filter((c) => c.status === "Ativo")
    .reduce((sum, c) => sum + estimatedMonthlyValue(c, currentYear), 0);

  const fixedCount = clients.filter((client) => normalizeBillingModel(client.billingModel) === "fixed").length;
  const variableCount = clients.filter((client) => normalizeBillingModel(client.billingModel) === "variable").length;
  const variableReceivedYear = clients
    .filter((client) => normalizeBillingModel(client.billingModel) === "variable")
    .reduce((sum, client) => sum + sumPaymentsForYear(client, currentYear), 0);

  const getDefaultBillingModel = () => activeNav === "variable" ? "variable" : "fixed";

  const getPageName = () => {
    if (activeNav === "fixed") return "Clientes fixos";
    if (activeNav === "variable") return "Clientes variáveis";
    if (activeNav === "annual") return "Anual";
    return "Dashboard geral";
  };

  const saveClient = async (form) => {
    if (!user) {
      alert("Você precisa estar logado para salvar.");
      return;
    }

    if (!form.name?.trim()) {
      alert("Preencha o nome do cliente.");
      return;
    }

    setSaving(true);

    try {
      const recordId = form.id || crypto.randomUUID();
      let logoPath = form.logoPath || null;
      let contractPath = form.pdfPath || null;
      let contractName = form.pdfName || null;

      if (form.logoFile) {
        const uploaded = await uploadFileToStorage({ bucket: "client-logos", userId: user.id, recordId, file: form.logoFile });
        logoPath = uploaded.path;
      }

      if (form.pdfUploadFile) {
        const uploaded = await uploadFileToStorage({ bucket: "contracts", userId: user.id, recordId, file: form.pdfUploadFile });
        contractPath = uploaded.path;
        contractName = form.pdfUploadFile.name;
      }

      if (!form.pdfFile && !form.pdfUploadFile) {
        contractPath = null;
        contractName = null;
      }

      const status = form.status || "Ativo";
      const payload = {
        id: recordId,
        user_id: user.id,
        name: form.name.trim(),
        instagram: form.instagram || null,
        cnpj: form.cnpj || null,
        company: form.company || null,
        responsible: form.responsible || null,
        cargo: form.cargo || null,
        email: form.email || null,
        phone: form.phone || null,
        city: form.city || null,
        state: form.state || null,
        country: form.country || "BR",
        type: form.type || "Mensal",
        value: Number(form.value || 0),
        billing_model: normalizeBillingModel(form.billingModel),
        monthly_payments: form.monthlyPayments || {},
        status,
        start_date: form.startDate || null,
        end_date: ["Ativo", "Prospecto"].includes(status) ? null : form.endDate || null,
        notes: form.notes || null,
        logo_path: logoPath,
        contract_path: contractPath,
        contract_name: contractName,
        updated_at: new Date().toISOString(),
      };

      const { error } = form.id
        ? await supabase.from("clients").update(payload).eq("id", form.id)
        : await supabase.from("clients").insert(payload);

      if (error) throw error;

      await loadClients();
      setDrawer(null);
    } catch (error) {
      console.error("Erro ao salvar cliente:", error);
      alert(`Erro ao salvar cliente: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteClient = async (client) => {
    if (!user) {
      alert("Você precisa estar logado para excluir.");
      return;
    }

    const confirmed = window.confirm(`Tem certeza que deseja excluir ${client.name}? Essa ação não pode ser desfeita.`);
    if (!confirmed) return;

    setDeletingId(client.id);

    try {
      const filesToRemove = [];
      if (client.logoPath) filesToRemove.push({ bucket: "client-logos", path: client.logoPath });
      if (client.pdfPath) filesToRemove.push({ bucket: "contracts", path: client.pdfPath });

      await Promise.all(filesToRemove.map(async ({ bucket, path }) => {
        const { error } = await supabase.storage.from(bucket).remove([path]);
        if (error) console.warn(`Não foi possível remover o arquivo do bucket ${bucket}:`, error);
      }));

      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", client.id)
        .eq("user_id", user.id);

      if (error) throw error;

      setClients((current) => current.filter((item) => item.id !== client.id));
      setDrawer((current) => current?.id === client.id ? null : current);
    } catch (error) {
      console.error("Erro ao excluir cliente:", error);
      alert(`Erro ao excluir cliente: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSidebarLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const r = new FileReader();
    r.onload = (ev) => {
      setSidebarLogo(ev.target.result);
      window.localStorage.setItem("crm_sidebar_logo", ev.target.result);
    };
    r.readAsDataURL(file);
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  if (authLoading) {
    return <div style={{ height: "100vh", background: C.bg, color: C.textSecondary, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter,sans-serif" }}>Carregando...</div>;
  }

  if (!session) return <AuthScreen />;

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, fontFamily: "'Inter',sans-serif", color: C.textPrimary, overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />

      <div style={{ width: 64, background: "#111111", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 0 14px", gap: 0, flexShrink: 0 }}>
        {NAV.map((n) => (
          <button key={n.key} title={n.label} onClick={() => setActiveNav(n.key)} style={{ width: 42, height: 42, borderRadius: 10, border: "none", background: activeNav === n.key ? "#1e3529" : "transparent", color: activeNav === n.key ? C.accent : C.textTertiary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4, transition: "all 200ms ease", fontSize: 20 }}>
            <i className={`ti ${n.icon}`} aria-label={n.label} />
          </button>
        ))}

        <button onClick={logout} title="Sair" style={{ width: 42, height: 42, borderRadius: 10, border: "none", background: "transparent", color: C.textTertiary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "auto", transition: "all 200ms ease", fontSize: 20 }}>
          <i className="ti ti-logout" />
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ minHeight: 76, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 24px", gap: 12, flexShrink: 0, background: C.bg }}>
          <div onClick={() => logoUploadRef.current.click()} title="Trocar logotipo" style={{ width: 156, height: 48, cursor: "pointer", borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: sidebarLogo ? "transparent" : C.card, border: sidebarLogo ? "none" : `1px dashed ${C.border}`, flexShrink: 0 }}>
            {sidebarLogo ? (
              <img src={sidebarLogo} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "left center" }} />
            ) : (
              <span style={{ color: C.textTertiary, fontSize: 12, fontWeight: 600 }}>Adicionar logotipo</span>
            )}
          </div>
          <input ref={logoUploadRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleSidebarLogo} />

          <div style={{ flex: 1 }} />

          {activeNav !== "annual" && (
            <button onClick={() => setShowFilter((v) => !v)} title="Filtros avançados" style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${activeFilterCount > 0 ? C.accent : C.border}`, background: activeFilterCount > 0 ? C.accentDark : "transparent", color: activeFilterCount > 0 ? C.accent : C.textSecondary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "relative", transition: "all 200ms", flexShrink: 0 }}>
              <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M1 1h12M3 6h8M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              {activeFilterCount > 0 && <span style={{ position: "absolute", top: -5, right: -5, width: 15, height: 15, borderRadius: "50%", background: C.accent, color: "#0a0a0a", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{activeFilterCount}</span>}
            </button>
          )}

          {activeNav !== "annual" && (
            <div style={{ position: "relative", width: "100%", maxWidth: 340 }}>
              <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.textTertiary, fontSize: 14 }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, empresa ou Instagram…" style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px 8px 32px", color: C.textPrimary, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "Inter,sans-serif" }} />
            </div>
          )}

          <button onClick={() => setDrawer({ billingModel: getDefaultBillingModel() })} style={{ background: C.accent, border: "none", color: "#0a0a0a", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, fontFamily: "Inter,sans-serif" }}>
            <i className="ti ti-plus" style={{ fontSize: 15 }} /> Novo cliente
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
            <div>
              <div style={{ color: C.textPrimary, fontSize: 18, fontWeight: 800 }}>{getPageName()}</div>
              <div style={{ color: C.textTertiary, fontSize: 12, marginTop: 3 }}>
                {activeNav === "annual" ? `Resumo financeiro e comercial de ${currentYear}` : activeNav === "fixed" ? "Somente clientes de cobrança fixa" : activeNav === "variable" ? "Somente clientes de cobrança variável" : "Todos os clientes cadastrados"}
              </div>
            </div>
          </div>

          {activeNav === "annual" ? (
            <AnnualDashboard clients={clients} />
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                <MetricCard label="Total de clientes" value={viewClients.length} />
                <MetricCard label="Ativos" value={ativos} />
                <MetricCard label="Receita/mês estimada" value={brl(mrrEstimated)} hint={activeNav === "variable" ? "Média dos pagamentos lançados" : undefined} />
                {activeNav === "dashboard" && <MetricCard label="Fixos / Variáveis" value={`${fixedCount} / ${variableCount}`} />}
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {STATUS_FILTERS.map((f) => (
                  <button key={f} onClick={() => setFilter(f)} style={{ padding: "5px 14px", borderRadius: 20, border: filter === f ? "none" : `1px solid ${C.border}`, background: filter === f ? C.accent : "transparent", color: filter === f ? "#0a0a0a" : C.textSecondary, fontSize: 12, fontWeight: filter === f ? 600 : 400, cursor: "pointer", transition: "all 200ms ease", fontFamily: "Inter,sans-serif" }}>
                    {f} <span style={{ opacity: 0.65 }}>{f === "Todos" ? viewClients.length : viewClients.filter((c) => c.status === f).length}</span>
                  </button>
                ))}
              </div>

              {loadingClients ? (
                <div style={{ color: C.textTertiary, fontSize: 14, padding: "40px 0", textAlign: "center" }}>Carregando clientes...</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 12 }}>
                  {filtered.map((c) => <ClientCard key={c.id} client={c} currentYear={currentYear} deletingId={deletingId} onDelete={deleteClient} onClick={(cl) => setDrawer(cl)} />)}
                  {filtered.length === 0 && (
                    <div style={{ color: C.textTertiary, fontSize: 14, padding: "40px 0", gridColumn: "1/-1", textAlign: "center" }}>
                      <i className="ti ti-users-off" style={{ fontSize: 30, display: "block", marginBottom: 10 }} />
                      Nenhum cliente encontrado
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showFilter && <FilterPanel filters={advFilters} setFilters={setAdvFilters} onClose={() => setShowFilter(false)} cities={cities} />}
      {drawer !== null && <Drawer client={Object.keys(drawer).length ? drawer : null} defaultBillingModel={getDefaultBillingModel()} onClose={() => setDrawer(null)} onSave={saveClient} saving={saving} />}
    </div>
  );
}
