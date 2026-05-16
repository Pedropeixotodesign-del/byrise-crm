import { useEffect, useRef, useState } from "react";
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
  badgeProspecto: { bg: "#0d1a2e", text: "#4a9eff" },
};

const NAV = [
  { icon: "ti-layout-dashboard", label: "Dashboard", key: "dashboard" },
  { icon: "ti-users", label: "Clientes", key: "clientes" },
  { icon: "ti-briefcase", label: "Projetos", key: "projetos" },
  { icon: "ti-file-description", label: "Contratos", key: "contratos" },
  { icon: "ti-settings", label: "Configurações", key: "settings" },
];

const STATUS_FILTERS = ["Todos", "Ativo", "Pausado", "Encerrado", "Prospecto"];

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

function contractAge(startDate) {
  if (!startDate) return null;

  const start = new Date(startDate);
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

function Badge({ status }) {
  const m = {
    Ativo: C.badgeAtivo,
    Pausado: C.badgePausado,
    Encerrado: C.badgeEncerrado,
    Prospecto: C.badgeProspecto,
  };
  const s = m[status] || m.Ativo;

  return (
    <span style={{ background: s.bg, color: s.text, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>
      {status}
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

function MetricCard({ label, value }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px", flex: 1, minWidth: 0 }}>
      <div style={{ color: C.textTertiary, fontSize: 11, fontWeight: 500, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
      <div style={{ color: C.accent, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{value}</div>
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
      <div style={{ position: "fixed", top: 60, right: 24, width: 300, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, zIndex: 50, padding: 20, animation: "slideDown 150ms ease" }}>
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

function DrawerField({ label, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: "block", color: C.textTertiary, fontSize: 11, fontWeight: 500, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</label>
      {children}
    </div>
  );
}

function Drawer({ client, onClose, onSave, saving }) {
  const empty = {
    name: "",
    instagram: "",
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
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const logoRef = useRef();
  const pdfRef = useRef();
  const isEdit = !!(client && Object.keys(client).length && client.id);

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
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, background: "#111111", borderLeft: `1px solid ${C.border}`, zIndex: 50, overflowY: "auto", padding: "28px 24px", animation: "slideIn 200ms ease", fontFamily: "Inter,sans-serif" }}>
        <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-pencil" style={{ color: C.accent, fontSize: 16 }} />
            <h2 style={{ color: C.textPrimary, fontSize: 15, fontWeight: 700, margin: 0 }}>{isEdit ? "Editar Cliente" : "Novo Cliente"}</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textSecondary, cursor: "pointer", fontSize: 20 }}><i className="ti ti-x" /></button>
        </div>

        <DrawerField label="Logo / Foto">
          <div onClick={() => logoRef.current.click()} style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: "14px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", background: "#0d0d0d" }}>
            {form.logo ? <img src={form.logo} alt="logo" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} /> : <><i className="ti ti-photo-up" style={{ color: C.textTertiary, fontSize: 24 }} /><span style={{ color: C.textTertiary, fontSize: 12 }}>Clique para upload</span></>}
          </div>
          <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogo} />
        </DrawerField>

        <DrawerField label="Nome do cliente"><input style={iStyle} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex: Dra. Ana Beatriz" /></DrawerField>
        <DrawerField label="Instagram"><input style={iStyle} value={form.instagram || ""} onChange={(e) => set("instagram", e.target.value)} placeholder="@cliente" /></DrawerField>
        <DrawerField label="Empresa / Clínica"><input style={iStyle} value={form.company || ""} onChange={(e) => set("company", e.target.value)} /></DrawerField>
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
          <DrawerField label="Tipo de contrato">
            <select style={iStyle} value={form.type || "Mensal"} onChange={(e) => set("type", e.target.value)}>
              {["Semanal", "Mensal", "Trimestral", "Semestral", "Anual"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </DrawerField>
          <DrawerField label="Valor (R$)"><input style={iStyle} type="number" value={form.value || ""} onChange={(e) => set("value", e.target.value)} /></DrawerField>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <DrawerField label="Data de início"><input style={iStyle} type="date" value={form.startDate || ""} onChange={(e) => set("startDate", e.target.value)} /></DrawerField>
          <DrawerField label="Data de término"><input style={iStyle} type="date" value={form.endDate || ""} onChange={(e) => set("endDate", e.target.value)} /></DrawerField>
        </div>

        <DrawerField label="Status">
          <select style={iStyle} value={form.status || "Ativo"} onChange={(e) => set("status", e.target.value)}>
            {["Ativo", "Pausado", "Encerrado", "Prospecto"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </DrawerField>

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

function ClientCard({ client, onClick }) {
  const [hov, setHov] = useState(false);
  const age = contractAge(client.startDate);

  return (
    <div
      onClick={() => onClick(client)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: hov ? C.cardHover : C.card, border: `1px solid ${hov ? C.accent + "44" : C.border}`, borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "all 200ms ease", display: "flex", flexDirection: "column", gap: 11 }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Avatar name={client.name} logo={client.logo} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.textPrimary, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client.name}</div>
          {client.instagram && <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>{client.instagram}</div>}
        </div>
        <Badge status={client.status} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 5, columnGap: 12, fontSize: 12 }}>
        <span style={{ color: C.textTertiary }}>Responsável</span><span style={{ color: C.textSecondary, textAlign: "right" }}>{client.responsible}</span>
        <span style={{ color: C.textTertiary }}>Cidade</span><span style={{ color: C.textSecondary, textAlign: "right" }}>{client.city}{client.state ? `, ${client.state}` : ""}</span>
        <span style={{ color: C.textTertiary }}>Contrato</span><span style={{ color: C.textSecondary, textAlign: "right" }}>{client.type}</span>
        <span style={{ color: C.textTertiary }}>Valor/mês</span><span style={{ color: C.accent, fontWeight: 700, textAlign: "right" }}>R$ {Number(client.value || 0).toLocaleString("pt-BR")}</span>
        {age && <><span style={{ color: C.textTertiary }}>Tempo</span><span style={{ color: "#4a9eff", fontWeight: 500, textAlign: "right" }}>{age}</span></>}
        {client.pdfName && <><span style={{ color: C.textTertiary }}>Contrato PDF</span><span style={{ color: C.textSecondary, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client.pdfName}</span></>}
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

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeNav, setActiveNav] = useState("clientes");
  const [filter, setFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState([]);
  const [drawer, setDrawer] = useState(null);
  const [showFilter, setShowFilter] = useState(false);
  const [advFilters, setAdvFilters] = useState({ type: "", location: "" });
  const [sidebarLogo, setSidebarLogo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const logoUploadRef = useRef();

  const user = session?.user;
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

  const filtered = clients.filter((c) => {
    const mStatus = filter === "Todos" || c.status === filter;
    const term = search.toLowerCase();
    const mSearch = !term || c.name.toLowerCase().includes(term) || (c.company || "").toLowerCase().includes(term) || (c.instagram || "").toLowerCase().includes(term);
    const mType = !advFilters.type || c.type === advFilters.type;
    const mLoc = !advFilters.location || c.city === advFilters.location;
    return mStatus && mSearch && mType && mLoc;
  });

  const cities = Array.from(new Set(clients.map((c) => c.city).filter(Boolean))).sort();
  const ativos = clients.filter((c) => c.status === "Ativo").length;
  const mrr = clients.filter((c) => c.status === "Ativo").reduce((s, c) => s + Number(c.value || 0), 0);

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

      const payload = {
        id: recordId,
        user_id: user.id,
        name: form.name.trim(),
        instagram: form.instagram || null,
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
        status: form.status || "Ativo",
        start_date: form.startDate || null,
        end_date: form.endDate || null,
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
        <div onClick={() => logoUploadRef.current.click()} title="Fazer upload do logotipo" style={{ width: 44, height: 36, marginBottom: 20, cursor: "pointer", borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a1a1a", border: `1px dashed ${C.border}`, transition: "border-color 200ms" }}>
          {sidebarLogo ? <img src={sidebarLogo} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <i className="ti ti-photo" style={{ color: C.textTertiary, fontSize: 18 }} aria-label="Upload logo" />}
        </div>
        <input ref={logoUploadRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleSidebarLogo} />

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
        <div style={{ height: 60, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 24px", gap: 12, flexShrink: 0, background: C.bg }}>
          <h1 style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, margin: 0, flexShrink: 0 }}>Clientes</h1>
          <div style={{ flex: 1, position: "relative" }}>
            <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.textTertiary, fontSize: 14 }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, empresa ou Instagram…" style={{ width: "100%", maxWidth: 320, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px 7px 32px", color: C.textPrimary, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "Inter,sans-serif" }} />
          </div>
          <button onClick={() => setShowFilter((v) => !v)} title="Filtros avançados" style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${activeFilterCount > 0 ? C.accent : C.border}`, background: activeFilterCount > 0 ? C.accentDark : "transparent", color: activeFilterCount > 0 ? C.accent : C.textSecondary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "relative", transition: "all 200ms", flexShrink: 0 }}>
            <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M1 1h12M3 6h8M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            {activeFilterCount > 0 && <span style={{ position: "absolute", top: -5, right: -5, width: 15, height: 15, borderRadius: "50%", background: C.accent, color: "#0a0a0a", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{activeFilterCount}</span>}
          </button>
          <button onClick={() => setDrawer({})} style={{ background: C.accent, border: "none", color: "#0a0a0a", fontWeight: 700, fontSize: 13, padding: "8px 16px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, fontFamily: "Inter,sans-serif" }}>
            <i className="ti ti-plus" style={{ fontSize: 15 }} /> Novo cliente
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
            <MetricCard label="Total de clientes" value={clients.length} />
            <MetricCard label="Ativos" value={ativos} />
            <MetricCard label="MRR estimado" value={`R$ ${mrr.toLocaleString("pt-BR")}`} />
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {STATUS_FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "5px 14px", borderRadius: 20, border: filter === f ? "none" : `1px solid ${C.border}`, background: filter === f ? C.accent : "transparent", color: filter === f ? "#0a0a0a" : C.textSecondary, fontSize: 12, fontWeight: filter === f ? 600 : 400, cursor: "pointer", transition: "all 200ms ease", fontFamily: "Inter,sans-serif" }}>
                {f} <span style={{ opacity: 0.65 }}>{f === "Todos" ? clients.length : clients.filter((c) => c.status === f).length}</span>
              </button>
            ))}
          </div>

          {loadingClients ? (
            <div style={{ color: C.textTertiary, fontSize: 14, padding: "40px 0", textAlign: "center" }}>Carregando clientes...</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 12 }}>
              {filtered.map((c) => <ClientCard key={c.id} client={c} onClick={(cl) => setDrawer(cl)} />)}
              {filtered.length === 0 && (
                <div style={{ color: C.textTertiary, fontSize: 14, padding: "40px 0", gridColumn: "1/-1", textAlign: "center" }}>
                  <i className="ti ti-users-off" style={{ fontSize: 30, display: "block", marginBottom: 10 }} />
                  Nenhum cliente encontrado
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showFilter && <FilterPanel filters={advFilters} setFilters={setAdvFilters} onClose={() => setShowFilter(false)} cities={cities} />}
      {drawer !== null && <Drawer client={Object.keys(drawer).length ? drawer : null} onClose={() => setDrawer(null)} onSave={saveClient} saving={saving} />}
    </div>
  );
}
