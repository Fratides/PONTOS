import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  LogOut,
  Moon,
  Package,
  Pencil,
  Plus,
  ReceiptText,
  Save,
  Store,
  Sun,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { AuthScreen, SplashScreen } from "./AuthScreens.jsx";
import { supabase } from "./supabase.js";

const STORAGE_KEY = "controle-reposicao-v1";
const THEME_STORAGE_KEY = "points-theme-preference";

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10";

function emptyData() {
  return { unitPrice: 0, points: [], orders: [] };
}

function normalizeData(value) {
  if (!value || !Array.isArray(value.points) || !Array.isArray(value.orders)) return null;

  return {
    unitPrice: Number.isFinite(value.unitPrice) && value.unitPrice >= 0 ? value.unitPrice : 0,
    points: value.points.filter(
      (point) => point && typeof point.id === "string" && typeof point.name === "string",
    ),
    orders: value.orders.filter(
      (order) => order && typeof order.id === "string" && typeof order.pointId === "string",
    ),
  };
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPriceValue(value) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function maskCurrency(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const amount = Number(digits) / 100;
  return Number.isFinite(amount) ? formatPriceValue(amount) : "";
}

function parseCurrency(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const amount = digits ? Number(digits) / 100 : 0;
  return Number.isFinite(amount) ? amount : Number.NaN;
}

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

function formatDate(value) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function getProfileName(user) {
  const metadata = user.user_metadata ?? {};
  const name = [metadata.full_name, metadata.name].find(
    (value) => typeof value === "string" && value.trim(),
  );
  return name?.trim() || user.email?.split("@")[0] || "Minha conta";
}

function getThemePreference() {
  const preference = window.localStorage.getItem(THEME_STORAGE_KEY);
  return preference === "light" || preference === "dark" ? preference : "system";
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getTotals(orders) {
  const totalsInCents = orders.reduce(
    (totals, order) => {
      totals.orders += Math.round(order.quantity * order.unitPrice * 100);
      totals.received += Math.round(order.received * 100);
      totals.quantity += order.quantity;
      return totals;
    },
    { orders: 0, received: 0, quantity: 0 },
  );

  return {
    orders: totalsInCents.orders / 100,
    received: totalsInCents.received / 100,
    quantity: totalsInCents.quantity,
  };
}

function CurrencyInput({ id, label, value, onChange, className = fieldClass, ...props }) {
  const inputRef = useRef(null);

  function handleChange(event) {
    const nextValue = maskCurrency(event.currentTarget.value);
    onChange(nextValue);
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(nextValue.length, nextValue.length);
    });
  }

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      className={className}
      placeholder="0,00"
      value={value}
      onChange={handleChange}
      {...props}
    />
  );
}

function SummaryCard({ title, value, hint, icon: Icon, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-500",
    green: "border-emerald-200 bg-emerald-50/60 text-emerald-700",
    amber: "border-amber-200 bg-amber-50/70 text-amber-700",
  };
  const iconTones = {
    slate: "bg-slate-100 text-slate-500",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
  };

  return (
    <article className={`min-w-0 rounded-xl border p-2 text-center sm:rounded-2xl sm:p-5 sm:text-left ${tones[tone]}`}>
      <div className="flex min-w-0 flex-col items-center gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="w-full min-w-0">
          <p className="min-h-6 text-[10px] font-medium leading-3 sm:min-h-0 sm:text-sm sm:leading-normal">
            {title}
          </p>
          <strong className="mt-1 block whitespace-nowrap text-sm font-semibold leading-[14px] tracking-tighter text-slate-900 sm:mt-2 sm:text-2xl sm:leading-tight sm:tracking-tight">
            {value}
          </strong>
        </div>
        <span className={`hidden size-10 shrink-0 place-items-center rounded-xl sm:grid ${iconTones[tone]}`}>
          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 hidden text-xs text-slate-500 sm:block">{hint}</p>
    </article>
  );
}

function Stat({ label, value, tone = "slate" }) {
  const valueTone = {
    slate: "text-slate-900",
    green: "text-emerald-700",
    amber: "text-amber-700",
  };

  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <strong className={`mt-1 block truncate text-sm font-semibold ${valueTone[tone]}`}>
        {value}
      </strong>
    </div>
  );
}

function Dashboard({ user, themeToggle }) {
  const [data, setData] = useState(emptyData);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [profileName, setProfileName] = useState(() => getProfileName(user));
  const [profileNameDraft, setProfileNameDraft] = useState(() => getProfileName(user));
  const [profileNameEditing, setProfileNameEditing] = useState(false);
  const [profileNameSaving, setProfileNameSaving] = useState(false);
  const savingRef = useRef(false);
  const [pointName, setPointName] = useState("");
  const [selectedPointId, setSelectedPointId] = useState(null);
  const [orderFormExpanded, setOrderFormExpanded] = useState(false);
  const [priceEditing, setPriceEditing] = useState(() => data.unitPrice <= 0);
  const [priceDraft, setPriceDraft] = useState("");
  const [orderDraft, setOrderDraft] = useState({
    date: localDate(),
    quantity: "",
    customPriceEnabled: false,
    customPrice: "",
  });
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editPriceDraft, setEditPriceDraft] = useState("");
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null);
  const [notice, setNotice] = useState(null);

  const priceCardRef = useRef(null);
  const priceInputRef = useRef(null);
  const pointSectionRef = useRef(null);
  const shouldScrollToPointRef = useRef(false);
  const cancelDeleteRef = useRef(null);
  const noticeTimer = useRef(null);

  useEffect(() => {
    let active = true;
    setData(emptyData());
    setDataLoading(true);
    setLoadError("");

    async function loadData() {
      const { data: savedRow, error } = await supabase
        .from("user_data")
        .select("data")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;

      if (savedRow) {
        const savedData = normalizeData(savedRow.data);
        if (!savedData) throw new Error("Os dados da conta estão em um formato inválido.");
        if (active) {
          setData(savedData);
          setPriceEditing(savedData.unitPrice <= 0);
        }
      } else {
        let initialData = emptyData();
        const legacyData = localStorage.getItem(STORAGE_KEY);
        if (legacyData !== null) {
          let parsedData;
          try {
            parsedData = JSON.parse(legacyData);
          } catch {
            throw new Error("Os dados antigos deste navegador não puderam ser lidos.");
          }
          initialData = normalizeData(parsedData);
          if (!initialData) throw new Error("Os dados antigos deste navegador estão inválidos.");
        }

        const { error: saveError } = await supabase.from("user_data").upsert({
          user_id: user.id,
          data: initialData,
        });
        if (saveError) throw saveError;

        if (legacyData !== null) localStorage.removeItem(STORAGE_KEY);
        if (active) {
          setData(initialData);
          setPriceEditing(initialData.unitPrice <= 0);
        }
      }

      if (active) setDataLoading(false);
    }

    loadData().catch((error) => {
      console.error("Não foi possível carregar os dados da conta.", error);
      if (active) {
        setLoadError(
          `Não foi possível carregar ou sincronizar seus dados. ${
            error instanceof Error ? error.message : ""
          }`,
        );
        setDataLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [user.id, loadAttempt]);

  useEffect(() => {
    if (!selectedPointId || !shouldScrollToPointRef.current) return undefined;
    shouldScrollToPointRef.current = false;

    const frame = requestAnimationFrame(() => {
      pointSectionRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [selectedPointId]);

  const selectedPoint = data.points.find((point) => point.id === selectedPointId) ?? null;
  const selectedOrders = useMemo(
    () =>
      selectedPoint
        ? data.orders
            .filter((order) => order.pointId === selectedPoint.id)
            .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
        : [],
    [data.orders, selectedPoint],
  );
  const grandTotals = useMemo(() => getTotals(data.orders), [data.orders]);
  const activePointTotals = useMemo(() => getTotals(selectedOrders), [selectedOrders]);
  const previewUnitPrice = orderDraft.customPriceEnabled
    ? parseCurrency(orderDraft.customPrice)
    : data.unitPrice;
  const orderQuantity = Number(orderDraft.quantity);
  const orderEstimate =
    Number.isInteger(orderQuantity) && orderQuantity > 0
      ? Math.round(orderQuantity * previewUnitPrice * 100) / 100
      : 0;
  const showPriceDetails = priceEditing || data.unitPrice <= 0;

  useEffect(() => {
    if (priceEditing && !dataLoading) {
      priceInputRef.current?.focus();
      priceInputRef.current?.select();
    }
  }, [priceEditing, dataLoading]);

  useEffect(() => {
    if (pendingDelete) cancelDeleteRef.current?.focus();
  }, [pendingDelete]);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!pendingDelete) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setPendingDelete(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingDelete]);

  function notify(text, type = "success") {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ text, type });
    noticeTimer.current = setTimeout(() => setNotice(null), 4200);
  }

  async function persist(nextData, successText) {
    if (savingRef.current) {
      notify("Aguarde a sincronização atual terminar antes de salvar novamente.", "error");
      return false;
    }

    savingRef.current = true;
    try {
      const { error } = await supabase.from("user_data").upsert({
        user_id: user.id,
        data: nextData,
      });
      if (error) throw error;
      setData(nextData);
      if (successText) notify(successText);
      return true;
    } catch (error) {
      console.error("Não foi possível sincronizar os dados.", error);
      notify(
        `Não foi possível sincronizar os dados. ${
          error instanceof Error ? error.message : ""
        }`,
        "error",
      );
      return false;
    } finally {
      savingRef.current = false;
    }
  }

  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error("Não foi possível sair da conta.", error);
      const message = `Não foi possível sair da conta. ${
        error instanceof Error ? error.message : ""
      }`;
      if (loadError) setLoadError(message);
      else notify(message, "error");
    }
  }

  function editProfileName() {
    setProfileNameDraft(profileName);
    setProfileNameEditing(true);
  }

  function cancelProfileNameEdit() {
    setProfileNameDraft(profileName);
    setProfileNameEditing(false);
  }

  async function saveProfileName(event) {
    event.preventDefault();
    const name = profileNameDraft.trim();
    if (!name) {
      notify("Informe um nome para o perfil.", "error");
      return;
    }

    setProfileNameSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: name },
      });
      if (error) throw error;
      setProfileName(name);
      setProfileNameDraft(name);
      setProfileNameEditing(false);
      notify("Nome do perfil atualizado.");
    } catch (error) {
      console.error("Não foi possível atualizar o nome do perfil.", error);
      notify(
        `Não foi possível atualizar o nome do perfil. ${
          error instanceof Error ? error.message : ""
        }`,
        "error",
      );
    } finally {
      setProfileNameSaving(false);
    }
  }

  function handleAppClick(event) {
    if (!priceEditing || priceCardRef.current?.contains(event.target)) return;
    setPriceEditing(false);
    setPriceDraft("");
  }

  function startPriceEdit() {
    setPriceDraft(data.unitPrice ? formatPriceValue(data.unitPrice) : "");
    setPriceEditing(true);
  }

  async function saveUnitPrice(event) {
    event.preventDefault();
    const price = parseCurrency(priceDraft);
    if (!Number.isFinite(price) || price <= 0) {
      notify("Informe um valor por produto maior que zero.", "error");
      return;
    }
    const nextData = { ...data, unitPrice: Math.round(price * 100) / 100 };
    if (await persist(nextData, "Valor do produto atualizado.")) {
      setPriceEditing(false);
      setPriceDraft("");
    }
  }

  async function addPoint(event) {
    event.preventDefault();
    const name = pointName.trim();
    if (!name) {
      notify("Informe o nome do ponto.", "error");
      return;
    }
    const point = { id: createId(), name };
    if (await persist({ ...data, points: [...data.points, point] }, `Ponto ${name} adicionado.`)) {
      setPointName("");
      shouldScrollToPointRef.current = true;
      setSelectedPointId(point.id);
      setOrderFormExpanded(false);
      setOrderDraft({
        date: localDate(),
        quantity: "",
        customPriceEnabled: false,
        customPrice: "",
      });
    }
  }

  function toggleCustomPrice() {
    if (orderDraft.customPriceEnabled) {
      setOrderDraft((current) => ({
        ...current,
        customPriceEnabled: false,
        customPrice: "",
      }));
      return;
    }
    setOrderDraft((current) => ({
      ...current,
      customPriceEnabled: true,
      customPrice: data.unitPrice ? formatPriceValue(data.unitPrice) : "",
    }));
  }

  async function addOrder(event) {
    event.preventDefault();
    const quantity = Number(orderDraft.quantity);
    const unitPrice = orderDraft.customPriceEnabled ? parseCurrency(orderDraft.customPrice) : data.unitPrice;
    if (!selectedPoint || !orderDraft.date || !Number.isInteger(quantity) || quantity <= 0) {
      notify("Informe a data e uma quantidade válida.", "error");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      notify("Defina um valor por produto maior que zero.", "error");
      return;
    }

    const order = {
      id: createId(),
      pointId: selectedPoint.id,
      date: orderDraft.date,
      quantity,
      unitPrice: Math.round(unitPrice * 100) / 100,
      received: 0,
    };
    if (
      await persist(
        { ...data, orders: [...data.orders, order] },
        "Pedido registrado.",
      )
    ) {
      setOrderDraft({
        date: localDate(),
        quantity: "",
        customPriceEnabled: false,
        customPrice: "",
      });
      setEditingOrderId(null);
      setOrderFormExpanded(false);
    }
  }

  async function registerPayment(event, order) {
    event.preventDefault();
    const amount = parseCurrency(paymentDrafts[order.id]);
    const totalCents = Math.round(order.quantity * order.unitPrice * 100);
    const receivedCents = Math.round(order.received * 100);
    const amountCents = Math.round(amount * 100);
    const remainingCents = totalCents - receivedCents;
    if (!Number.isFinite(amount) || amountCents <= 0 || amountCents > remainingCents) {
      notify(`Informe um valor maior que zero e até ${money(remainingCents / 100)}.`, "error");
      return;
    }

    const nextOrders = data.orders.map((item) =>
      item.id === order.id
        ? { ...item, received: (receivedCents + amountCents) / 100 }
        : item,
    );
    if (await persist({ ...data, orders: nextOrders }, `Recebimento de ${money(amount)} registrado.`)) {
      setPaymentDrafts((current) => ({ ...current, [order.id]: "" }));
    }
  }

  async function saveOrderPrice(event, order) {
    event.preventDefault();
    const price = parseCurrency(editPriceDraft);
    if (!Number.isFinite(price) || price <= 0) {
      notify("Informe um valor por produto maior que zero.", "error");
      return;
    }
    const totalCents = order.quantity * Math.round(price * 100);
    const receivedCents = Math.round(order.received * 100);
    if (totalCents < receivedCents) {
      notify(`O total não pode ser menor que o valor já recebido (${money(order.received)}).`, "error");
      return;
    }

    const nextOrders = data.orders.map((item) =>
      item.id === order.id ? { ...item, unitPrice: Math.round(price * 100) / 100 } : item,
    );
    if (await persist({ ...data, orders: nextOrders }, "Valor deste pedido atualizado.")) {
      setEditingOrderId(null);
      setEditPriceDraft("");
    }
  }

  function openDeletePoint(point) {
    const relatedOrders = data.orders.filter((order) => order.pointId === point.id).length;
    setPendingDelete({ type: "point", id: point.id, name: point.name, relatedOrders });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    if (pendingDelete.type === "point") {
      const nextData = {
        ...data,
        points: data.points.filter((point) => point.id !== pendingDelete.id),
        orders: data.orders.filter((order) => order.pointId !== pendingDelete.id),
      };
      if (await persist(nextData, `Ponto ${pendingDelete.name} e seus pedidos foram excluídos.`)) {
        if (selectedPointId === pendingDelete.id) setSelectedPointId(null);
        setPendingDelete(null);
        setEditingOrderId(null);
      }
      return;
    }

    const nextData = {
      ...data,
      orders: data.orders.filter((order) => order.id !== pendingDelete.id),
    };
    if (await persist(nextData, "Pedido excluído.")) {
      setPendingDelete(null);
      if (editingOrderId === pendingDelete.id) setEditingOrderId(null);
    }
  }

  function openPoint(point) {
    setSelectedPointId(point.id);
    setEditingOrderId(null);
    setOrderFormExpanded(false);
    setOrderDraft({
      date: localDate(),
      quantity: "",
      customPriceEnabled: false,
      customPrice: "",
    });
  }

  function goToPoints() {
    setSelectedPointId(null);
    setEditingOrderId(null);
  }

  if (dataLoading) {
    return null;
  }

  if (loadError) {
    return (
      <>
        <div className="theme-toggle-floating">{themeToggle}</div>
        <main className="auth-loading sync-error">
          <CircleAlert size={27} aria-hidden="true" />
          <h1>Não foi possível abrir seus dados</h1>
          <p>{loadError}</p>
          <div className="sync-error-actions">
            <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
              Tentar novamente
            </button>
            <button type="button" onClick={signOut}>
              Sair da conta
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800" onClick={handleAppClick}>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-9 lg:px-8">
        <div className="dashboard-theme-toggle">{themeToggle}</div>
        <header className="mb-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:gap-6 sm:p-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
          <div className="flex items-start justify-between gap-3 lg:col-span-2">
            <div className="flex min-w-0 items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                <Store size={23} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 sm:block">
                  Controle de vendas
                </p>
                <h1 className="mt-0 hidden text-2xl font-semibold tracking-tight text-slate-950 sm:mt-2 sm:block sm:text-3xl">
                  Pontos de Reposição
                </h1>
                <p className="mt-2 hidden max-w-xl text-sm leading-6 text-slate-500 sm:block">
                  Acompanhe pedidos, recebimentos e valores em aberto por ponto.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {profileNameEditing ? (
                <form className="flex items-center gap-1" onSubmit={saveProfileName}>
                  <label className="sr-only" htmlFor="profile-name">
                    Nome do perfil
                  </label>
                  <input
                    id="profile-name"
                    className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 sm:w-36"
                    autoComplete="name"
                    maxLength={80}
                    value={profileNameDraft}
                    onChange={(event) => setProfileNameDraft(event.target.value)}
                    disabled={profileNameSaving}
                    required
                  />
                  <button
                    type="submit"
                    aria-label="Salvar nome"
                    title="Salvar nome"
                    className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={profileNameSaving}
                  >
                    <Check size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancelar alteração do nome"
                    title="Cancelar"
                    onClick={cancelProfileNameEdit}
                    className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100"
                    disabled={profileNameSaving}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </form>
              ) : (
                <div className="flex max-w-36 items-center sm:max-w-48">
                  <button
                    type="button"
                    aria-label={`Editar nome do perfil: ${profileName}`}
                    title="Clique para editar o nome do perfil"
                    onClick={editProfileName}
                    className="group flex min-h-8 max-w-full items-center gap-1 rounded-lg px-1 text-left text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                  >
                    <span className="max-w-24 truncate sm:max-w-40">{profileName}</span>
                    <Pencil
                      size={14}
                      aria-hidden="true"
                      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                    />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={signOut}
                aria-label="Sair da conta"
                title="Sair da conta"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-0 rounded-xl border border-slate-200 bg-white px-0 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-500/10 sm:w-auto sm:gap-2 sm:px-3"
              >
                <LogOut size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          </div>

          <div
            ref={priceCardRef}
            className={`rounded-2xl border border-slate-200 bg-slate-50/80 lg:col-span-2 lg:justify-self-end ${
              showPriceDetails
                ? "p-4 lg:w-[340px]"
                : "w-full p-2 sm:w-fit sm:justify-self-start lg:justify-self-end"
            }`}
          >
            {showPriceDetails && (
              <h1 className="mb-3 truncate text-base font-semibold tracking-tight text-slate-950 sm:hidden">
                Pontos de Reposição
              </h1>
            )}
            {showPriceDetails && (
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-600">
                <Wallet size={16} className="text-emerald-700" aria-hidden="true" />
                Valor único do produto
              </div>
            )}
            {showPriceDetails ? (
              <form className="flex items-center gap-2" onSubmit={saveUnitPrice}>
                <span className="text-sm font-medium text-slate-500">R$</span>
                <CurrencyInput
                  ref={priceInputRef}
                  id="unit-price"
                  label="Novo valor único"
                  value={priceDraft}
                  onChange={setPriceDraft}
                  required
                  className={`${fieldClass} min-w-0 flex-1`}
                />
                <button
                  type="submit"
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-600/20"
                >
                  <Check size={16} aria-hidden="true" />
                  Salvar
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-slate-950 sm:hidden">
                  Pontos de Reposição
                </h1>
                <button
                  type="button"
                  aria-label="Editar valor único do produto"
                  onClick={startPriceEdit}
                  className="ml-auto inline-flex min-h-9 shrink-0 items-center rounded-xl border border-transparent bg-transparent px-2 text-left transition hover:bg-white/70 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 sm:ml-0"
                >
                  <strong className="text-lg font-semibold tracking-tight text-slate-950">
                    {money(data.unitPrice)}
                  </strong>
                </button>
              </div>
            )}
            {showPriceDetails && (
              <p className="mt-2 text-xs text-slate-500">
                O preço salvo vale para os próximos pedidos.
              </p>
            )}
          </div>
        </header>

        <section className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3" aria-label="Resumo geral">
          <SummaryCard
            title="Total em pedidos"
            value={money(grandTotals.orders)}
            hint="Valor dos produtos enviados"
            icon={Package}
          />
          <SummaryCard
            title="Total recebido"
            value={money(grandTotals.received)}
            hint="Pagamentos registrados"
            icon={BadgeCheck}
            tone="green"
          />
          <SummaryCard
            title="Total em aberto"
            value={money(grandTotals.orders - grandTotals.received)}
            hint="Valor que falta receber"
            icon={Clock3}
            tone={grandTotals.orders > grandTotals.received ? "amber" : "slate"}
          />
        </section>

        <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                Cadastro
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                Adicionar ponto
              </h2>
            </div>
            <form className="flex gap-2" onSubmit={addPoint}>
              <label className="sr-only" htmlFor="point-name">
                Nome do novo ponto
              </label>
              <input
                id="point-name"
                className={`${fieldClass} min-w-0 flex-1`}
                value={pointName}
                onChange={(event) => setPointName(event.target.value)}
                maxLength={80}
                placeholder="Nome do ponto (ex.: Loja Centro)"
                required
              />
              <button
                type="submit"
                aria-label="Adicionar ponto"
                title="Adicionar ponto"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-600/20"
              >
                <Plus size={21} strokeWidth={3} aria-hidden="true" />
              </button>
            </form>
            <p className="mt-2 text-xs text-slate-500">
              Cada ponto pode ter vários pedidos. Abra um ponto para registrar pedidos ou consultar o histórico.
            </p>
          </div>

          {!selectedPoint && (
            <div>
              <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Seus clientes
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-slate-900">
                    Pontos cadastrados
                  </h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {data.points.length} {data.points.length === 1 ? "ponto" : "pontos"}
                </span>
              </div>
              <div className="px-5 pb-5 sm:px-6">
                {data.points.length ? (
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                    {data.points.map((point) => {
                      const pointOrders = data.orders.filter((order) => order.pointId === point.id);
                      const totals = getTotals(pointOrders);
                      return (
                        <article
                          key={point.id}
                          className="group flex items-center gap-3 bg-white px-3 py-3 transition hover:bg-slate-50/80 sm:px-4"
                        >
                          <button
                            type="button"
                            onClick={() => openPoint(point)}
                            className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-left sm:grid-cols-[minmax(0,1.3fr)_0.8fr_0.8fr_1fr_auto]"
                          >
                            <span className="flex min-w-0 items-center gap-3 sm:row-span-2">
                              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 transition group-hover:bg-emerald-50 group-hover:text-emerald-700">
                                <Store size={17} aria-hidden="true" />
                              </span>
                              <span className="truncate text-sm font-semibold text-slate-900">
                                {point.name}
                              </span>
                            </span>
                            <span className="text-xs text-slate-500 sm:text-sm">
                              {pointOrders.length} {pointOrders.length === 1 ? "pedido" : "pedidos"}
                            </span>
                            <span className="hidden text-sm text-slate-500 sm:block">
                              {totals.quantity} {totals.quantity === 1 ? "unidade" : "unidades"}
                            </span>
                            <span className="col-start-2 row-start-1 text-right text-sm font-semibold text-emerald-700 sm:col-auto sm:row-auto sm:text-left">
                              {money(totals.received)}
                              <span className="ml-1 hidden text-xs font-normal text-slate-400 sm:inline">
                                recebido
                              </span>
                            </span>
                            <span className="hidden text-slate-400 sm:block">
                              <ChevronRight size={17} aria-hidden="true" />
                            </span>
                          </button>
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
                            <button
                              type="button"
                              aria-label={`Excluir ${point.name}`}
                              title="Excluir ponto"
                              onClick={() => openDeletePoint(point)}
                              className="grid size-full place-items-center rounded-xl focus:outline-none focus:ring-4 focus:ring-rose-500/15"
                            >
                              <Trash2 size={17} aria-hidden="true" />
                            </button>
                          </span>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center">
                    <span className="mx-auto grid size-11 place-items-center rounded-xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
                      <Store size={19} aria-hidden="true" />
                    </span>
                    <p className="mt-3 text-sm font-medium text-slate-700">Nenhum ponto cadastrado</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Adicione seu primeiro ponto para começar.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {selectedPoint && (
          <section
            ref={pointSectionRef}
            className="scroll-mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={goToPoints}
                  aria-label="Voltar para todos os pontos"
                  className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                >
                  <ArrowLeft size={17} aria-hidden="true" />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    Ponto selecionado
                  </p>
                  <h2 className="mt-1 truncate text-lg font-semibold text-slate-950">
                    {selectedPoint.name}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={goToPoints}
                className="inline-flex items-center gap-2 self-start rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:self-auto"
              >
                Todos os pontos
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:grid-cols-4 sm:px-6">
              <Stat
                label={activePointTotals.quantity === 1 ? "Unidade" : "Unidades"}
                value={activePointTotals.quantity}
              />
              <Stat label="Total em pedidos" value={money(activePointTotals.orders)} />
              <Stat label="Já recebido" value={money(activePointTotals.received)} tone="green" />
              <Stat
                label="Em aberto"
                value={money(activePointTotals.orders - activePointTotals.received)}
                tone={activePointTotals.orders > activePointTotals.received ? "amber" : "slate"}
              />
            </div>

            <div className="p-5 sm:p-6">
              <button
                type="button"
                aria-expanded={orderFormExpanded}
                aria-controls="add-order-form"
                onClick={() => setOrderFormExpanded((expanded) => !expanded)}
                className="mb-4 flex w-full items-center gap-2 rounded-xl text-left"
              >
                <span className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                  <Plus size={16} aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold text-slate-900">Adicionar pedido</span>
                <ChevronDown
                  size={17}
                  className={`ml-auto text-slate-400 transition-transform ${
                    orderFormExpanded ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>
              <div
                id="add-order-form"
                className={orderFormExpanded ? "block" : "hidden"}
              >
                <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={addOrder}>
                  <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                    Data do pedido
                    <span className="relative">
                      <CalendarDays
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        type="date"
                        className={`${fieldClass} pl-9`}
                        value={orderDraft.date}
                        onChange={(event) =>
                          setOrderDraft((current) => ({ ...current, date: event.target.value }))
                        }
                        required
                      />
                    </span>
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                    Quantidade
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className={fieldClass}
                      placeholder="0"
                      value={orderDraft.quantity}
                      onChange={(event) =>
                        setOrderDraft((current) => ({ ...current, quantity: event.target.value }))
                      }
                      required
                    />
                  </label>

                  <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-slate-500">Valor por produto</p>
                      <strong className="text-sm font-semibold text-slate-900">
                        {money(previewUnitPrice)}
                      </strong>
                    </div>
                    {!orderDraft.customPriceEnabled && (
                      <button
                        type="button"
                        onClick={toggleCustomPrice}
                        className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                      >
                        Alterar valor
                      </button>
                    )}
                  </div>

                  {orderDraft.customPriceEnabled && (
                    <div className="grid gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 sm:col-span-2 lg:col-span-4 lg:grid-cols-[minmax(0,250px)_auto] lg:items-end">
                      <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                        Valor deste pedido (R$)
                        <CurrencyInput
                          label="Valor deste pedido"
                          value={orderDraft.customPrice}
                          onChange={(value) =>
                            setOrderDraft((current) => ({ ...current, customPrice: value }))
                          }
                          className={fieldClass}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={toggleCustomPrice}
                        className="h-11 justify-self-start rounded-xl px-3 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
                      >
                        Usar valor único
                      </button>
                    </div>
                  )}

                  <div className="flex min-h-11 items-center justify-between rounded-xl bg-emerald-50 px-3.5">
                    <span className="text-xs font-medium text-emerald-800">Total do pedido</span>
                    <strong className="text-base font-semibold tracking-tight text-emerald-800">
                      {money(orderEstimate)}
                    </strong>
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-600/20 sm:col-span-2 lg:col-span-1"
                  >
                    <Save size={16} aria-hidden="true" />
                    Salvar
                  </button>
                </form>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Preço padrão para novos pedidos: {money(data.unitPrice)}. Se precisar, altere o valor apenas deste pedido.
                </p>
              </div>

              <div className="mb-3 mt-8 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ReceiptText size={17} className="text-slate-400" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-slate-900">Pedidos deste ponto</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {selectedOrders.length} {selectedOrders.length === 1 ? "pedido" : "pedidos"}
                </span>
              </div>

              {selectedOrders.length ? (
                <div className="space-y-3">
                  {selectedOrders.map((order) => {
                    const total = Math.round(order.quantity * order.unitPrice * 100) / 100;
                    const pending = Math.max(0, Math.round((total - order.received) * 100) / 100);
                    const isEditing = editingOrderId === order.id;
                    return (
                      <article
                        key={order.id}
                        className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <CalendarDays size={15} className="text-slate-400" aria-hidden="true" />
                            {formatDate(order.date)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingOrderId(isEditing ? null : order.id);
                                setEditPriceDraft(formatPriceValue(order.unitPrice));
                              }}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                            >
                              <Pencil size={14} aria-hidden="true" />
                              {isEditing ? "Fechar" : "Editar preço"}
                            </button>
                            <button
                              type="button"
                              aria-label={`Excluir pedido de ${selectedPoint.name}`}
                              title="Excluir pedido"
                              onClick={() =>
                                setPendingDelete({ type: "order", id: order.id })
                              }
                              className="grid size-9 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-500/15"
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
                          <Stat label="Quantidade" value={order.quantity} />
                          <Stat label="Valor unitário" value={money(order.unitPrice)} />
                          <Stat label="Pedido" value={money(total)} />
                          <Stat label="Recebido" value={money(order.received)} tone="green" />
                          <Stat label="Falta receber" value={money(pending)} tone={pending > 0 ? "amber" : "slate"} />
                        </div>

                        {isEditing && (
                          <form
                            className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-end"
                            onSubmit={(event) => saveOrderPrice(event, order)}
                          >
                            <label className="grid max-w-xs flex-1 gap-1.5 text-xs font-medium text-slate-600">
                              Novo valor por produto
                              <CurrencyInput
                                label={`Novo valor por produto do pedido de ${formatDate(order.date)}`}
                                value={editPriceDraft}
                                onChange={setEditPriceDraft}
                                required
                              />
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                              >
                                <Check size={15} aria-hidden="true" />
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingOrderId(null)}
                                className="h-11 rounded-xl border border-slate-200 px-3.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </form>
                        )}

                        {pending > 0 ? (
                          <form
                            className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-end"
                            onSubmit={(event) => registerPayment(event, order)}
                          >
                            <label className="grid max-w-xs flex-1 gap-1.5 text-xs font-medium text-slate-600">
                              Adicionar recebimento
                              <CurrencyInput
                                label={`Adicionar recebimento do pedido de ${formatDate(order.date)}`}
                                value={paymentDrafts[order.id] ?? ""}
                                onChange={(value) =>
                                  setPaymentDrafts((current) => ({
                                    ...current,
                                    [order.id]: value,
                                  }))
                                }
                              />
                            </label>
                            <button
                              type="submit"
                              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
                            >
                              <Check size={15} aria-hidden="true" />
                              Registrar
                            </button>
                          </form>
                        ) : (
                          <p className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs font-medium text-emerald-700">
                            <BadgeCheck size={15} aria-hidden="true" />
                            Pedido pago
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center">
                  <span className="mx-auto grid size-11 place-items-center rounded-xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
                    <ReceiptText size={19} aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-sm font-medium text-slate-700">Nenhum pedido neste ponto</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Preencha a data e a quantidade acima para registrar um pedido.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        <footer className="py-6 text-center text-xs text-slate-400">
          Seus dados são sincronizados na sua conta.
        </footer>
      </main>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingDelete(null);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            aria-describedby="delete-description"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/15 sm:p-6"
          >
            <div className="grid size-11 place-items-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
              <Trash2 size={20} aria-hidden="true" />
            </div>
            <h2 id="delete-title" className="mt-4 text-lg font-semibold tracking-tight text-slate-950">
              {pendingDelete.type === "point" ? "Excluir ponto?" : "Excluir pedido?"}
            </h2>
            <p id="delete-description" className="mt-2 text-sm leading-6 text-slate-600">
              {pendingDelete.type === "point"
                ? pendingDelete.relatedOrders
                  ? `Excluir o ponto “${pendingDelete.name}” também excluirá ${pendingDelete.relatedOrders} ${pendingDelete.relatedOrders === 1 ? "pedido vinculado" : "pedidos vinculados"}. Essa ação não pode ser desfeita.`
                  : `O ponto “${pendingDelete.name}” será excluído. Essa ação não pode ser desfeita.`
                : "Este pedido e os recebimentos registrados nele serão excluídos. Essa ação não pode ser desfeita."}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                ref={cancelDeleteRef}
                type="button"
                onClick={() => setPendingDelete(null)}
                className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-500/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-500/20"
              >
                <Trash2 size={15} aria-hidden="true" />
                Excluir
              </button>
            </div>
          </section>
        </div>
      )}

      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={`fixed bottom-4 right-4 z-[60] flex max-w-[calc(100vw-2rem)] items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg ${
            notice.type === "error"
              ? "border-rose-200 bg-white text-rose-800"
              : "border-emerald-200 bg-white text-slate-700"
          }`}
        >
          {notice.type === "error" ? (
            <CircleAlert size={17} className="mt-0.5 shrink-0 text-rose-600" aria-hidden="true" />
          ) : (
            <Check size={17} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
          )}
          <span>{notice.text}</span>
          <button
            type="button"
            aria-label="Fechar mensagem"
            onClick={() => setNotice(null)}
            className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [authError, setAuthError] = useState("");
  const [themePreference, setThemePreference] = useState(getThemePreference);
  const [systemTheme, setSystemTheme] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const theme = themePreference === "system" ? systemTheme : themePreference;

  useEffect(() => {
    const timer = window.setTimeout(() => setSplashDone(true), 1900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemTheme(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", updateSystemTheme);
    return () => mediaQuery.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Não foi possível verificar a sessão.", error);
          setAuthError(`Não foi possível verificar sua sessão. ${error.message}`);
        }
        setSession(data.session);
        setAuthLoading(false);
      })
      .catch((error) => {
        console.error("Não foi possível verificar a sessão.", error);
        if (active) {
          setAuthError(
            `Não foi possível verificar sua sessão. ${
              error instanceof Error ? error.message : ""
            }`,
          );
          setAuthLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setAuthError("");
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setThemePreference(nextTheme);
  }

  const themeToggle = (
    <button
      className="theme-toggle"
      type="button"
      aria-label={`Ativar tema ${theme === "dark" ? "claro" : "escuro"}`}
      title={`Ativar tema ${theme === "dark" ? "claro" : "escuro"}`}
      aria-pressed={theme === "dark"}
      onClick={toggleTheme}
    >
      {theme === "dark" ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );

  if (!splashDone) {
    return (
      <>
        <div className="theme-toggle-floating">{themeToggle}</div>
        <SplashScreen />
      </>
    );
  }
  if (authLoading) {
    return null;
  }
  if (!session) {
    return (
      <AuthScreen
        configured={Boolean(supabase)}
        authError={authError}
        themeToggle={themeToggle}
      />
    );
  }
  return <Dashboard key={session.user.id} user={session.user} themeToggle={themeToggle} />;
}

export default App;
