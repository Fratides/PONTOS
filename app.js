const STORAGE_KEY = "controle-reposicao-v1";

const emptyState = () => ({ unitPrice: 0, points: [], orders: [] });
let state = loadState();

const priceForm = document.querySelector("#price-form");
const editPriceButton = document.querySelector("#edit-price-button");
const pointForm = document.querySelector("#point-form");
const orderForm = document.querySelector("#order-form");
const orderDate = document.querySelector("#order-date");
const orderQuantity = document.querySelector("#order-quantity");
const orderPriceOverride = document.querySelector("#order-price-override");
const orderUnitPriceInput = document.querySelector("#order-unit-price");
const toggleOrderPriceButton = document.querySelector("#toggle-order-price");
const message = document.querySelector("#app-message");
const deleteDialog = document.querySelector("#delete-dialog");
let activePointId = null;
let editingOrderId = null;
let pendingDeletion = null;
let editingUnitPrice = state.unitPrice <= 0;
let orderPriceOverrideEnabled = false;

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyState();

    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.points) || !Array.isArray(parsed.orders)) {
      throw new Error("Os dados salvos estão em um formato inválido.");
    }

    return {
      unitPrice: Number.isFinite(parsed.unitPrice) && parsed.unitPrice >= 0 ? parsed.unitPrice : 0,
      points: parsed.points.filter((point) => point && typeof point.id === "string" && typeof point.name === "string"),
      orders: parsed.orders.filter((order) => order && typeof order.id === "string" && typeof order.pointId === "string"),
    };
  } catch (error) {
    console.error("Não foi possível carregar os dados salvos.", error);
    return emptyState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error("Não foi possível salvar os dados.", error);
    showMessage("Não foi possível salvar. Verifique o espaço disponível no navegador.");
    return false;
  }
}

function showMessage(text) {
  message.textContent = text;
}

function requestDeletion(type, id, label, relatedOrders = 0) {
  pendingDeletion = { type, id };
  document.querySelector("#delete-dialog-title").textContent = type === "point" ? "Excluir ponto?" : "Excluir pedido?";
  document.querySelector("#delete-dialog-message").textContent = type === "point"
    ? relatedOrders
      ? `Excluir o ponto “${label}” também excluirá ${relatedOrders} ${relatedOrders === 1 ? "pedido vinculado" : "pedidos vinculados"}. Essa ação não pode ser desfeita.`
      : `O ponto “${label}” será excluído. Essa ação não pode ser desfeita.`
    : "Este pedido e os recebimentos registrados nele serão excluídos. Essa ação não pode ser desfeita.";
  deleteDialog.showModal();
}

function trashIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function confirmDeletion() {
  const deletion = pendingDeletion;
  deleteDialog.close();
  pendingDeletion = null;
  if (!deletion) return;

  if (deletion.type === "point") {
    const point = state.points.find((item) => item.id === deletion.id);
    if (!point) return;
    const previousPoints = state.points;
    const previousOrders = state.orders;
    const previousActivePointId = activePointId;
    state.points = state.points.filter((item) => item.id !== point.id);
    state.orders = state.orders.filter((order) => order.pointId !== point.id);
    if (activePointId === point.id) activePointId = null;
    editingOrderId = null;
    if (saveState()) {
      render();
      showMessage(`Ponto ${point.name} e seus pedidos foram excluídos.`);
    } else {
      state.points = previousPoints;
      state.orders = previousOrders;
      activePointId = previousActivePointId;
      render();
    }
    return;
  }

  const order = state.orders.find((item) => item.id === deletion.id);
  if (!order) return;
  const previousOrders = state.orders;
  state.orders = state.orders.filter((item) => item.id !== order.id);
  if (editingOrderId === order.id) editingOrderId = null;
  if (saveState()) {
    render();
    showMessage("Pedido excluído.");
  } else {
    state.orders = previousOrders;
    render();
  }
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatPriceValue(value) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseCurrencyInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function getTotals(orders) {
  return orders.reduce((totals, order) => {
    const total = order.quantity * order.unitPrice;
    totals.orders += total;
    totals.received += order.received;
    totals.quantity += order.quantity;
    return totals;
  }, { orders: 0, received: 0, quantity: 0 });
}

function render() {
  const allTotals = getTotals(state.orders);
  const activePoint = state.points.find((point) => point.id === activePointId);
  if (!activePoint) activePointId = null;
  document.querySelector("#unit-price").value = state.unitPrice ? formatPriceValue(state.unitPrice) : "";
  document.querySelector("#price-form").hidden = !editingUnitPrice;
  editPriceButton.hidden = editingUnitPrice;
  document.querySelector("#unit-price-display").textContent = money(state.unitPrice);
  document.querySelector("#grand-total").textContent = money(allTotals.orders);
  document.querySelector("#grand-received").textContent = money(allTotals.received);
  document.querySelector("#grand-pending").textContent = money(allTotals.orders - allTotals.received);
  document.querySelector("#point-count").textContent = `${state.points.length} ${state.points.length === 1 ? "ponto" : "pontos"}`;
  document.querySelector("#order-price-note").textContent = `Preço padrão para novos pedidos: ${money(state.unitPrice)}. Se precisar, altere o valor apenas deste pedido.`;
  updateOrderPreview();
  document.querySelector("#empty-points").hidden = state.points.length > 0;
  document.querySelector("#point-directory").hidden = Boolean(activePoint);
  document.querySelector("#active-point-panel").hidden = !activePoint;
  renderPointList();
  renderActivePoint(activePoint);
}

function updateOrderPreview() {
  const quantity = Number(orderQuantity.value);
  const unitPrice = orderPriceOverrideEnabled ? parseCurrencyInput(orderUnitPriceInput.value) : state.unitPrice;
  document.querySelector("#order-unit-price-display").textContent = money(unitPrice);
  document.querySelector("#order-total-estimate").textContent = money(
    Number.isInteger(quantity) && quantity > 0 ? quantity * unitPrice : 0,
  );
}

function renderPointList() {
  document.querySelector("#point-list").innerHTML = state.points.map((point) => {
    const orders = state.orders.filter((order) => order.pointId === point.id);
    const totals = getTotals(orders);
    return `<article class="point-card">
      <button class="point-card-open" type="button" data-open-point="${escapeHtml(point.id)}">
        <span class="point-card-title">${escapeHtml(point.name)}</span>
        <span class="point-card-meta">${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"} · ${totals.quantity} ${totals.quantity === 1 ? "unidade" : "unidades"}</span>
        <span class="point-card-total">${money(totals.received)} <small>recebidos</small></span>
        <span class="point-card-arrow" aria-hidden="true">›</span>
      </button>
      <button class="action-button delete-button point-delete" type="button" data-delete-point="${escapeHtml(point.id)}" aria-label="Excluir ${escapeHtml(point.name)}" title="Excluir ponto">${trashIcon()}</button>
    </article>`;
  }).join("");
}

function renderActivePoint(point) {
  const orderList = document.querySelector("#active-order-list");
  const emptyOrders = document.querySelector("#empty-orders");
  if (!point) {
    orderList.innerHTML = "";
    emptyOrders.hidden = true;
    return;
  }

  const orders = state.orders
    .filter((order) => order.pointId === point.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const totals = getTotals(orders);
  document.querySelector("#active-point-name").textContent = point.name;
  document.querySelector("#active-order-count").textContent = `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"}`;
  document.querySelector("#active-point-totals").innerHTML = `
    <span>${totals.quantity} ${totals.quantity === 1 ? "unidade" : "unidades"}</span>
    <span>Pedidos: <strong>${money(totals.orders)}</strong></span>
    <span>Recebido: <strong class="money-received">${money(totals.received)}</strong></span>
    <span>Em aberto: <strong class="money-pending">${money(totals.orders - totals.received)}</strong></span>`;
  emptyOrders.hidden = orders.length > 0;

  orderList.innerHTML = orders.map((order) => {
    const total = order.quantity * order.unitPrice;
    const pending = total - order.received;
    const isEditingPrice = editingOrderId === order.id;
    return `<article class="order-card">
      <div class="order-card-top">
        <span class="order-card-date">${escapeHtml(formatDate(order.date))}</span>
        <div class="row-actions">
          <button class="action-button" type="button" data-edit-price="${escapeHtml(order.id)}">${isEditingPrice ? "Fechar edição" : "Editar preço"}</button>
          <button class="action-button delete-button" type="button" data-delete-order="${escapeHtml(order.id)}" aria-label="Excluir pedido de ${escapeHtml(point.name)}" title="Excluir pedido">${trashIcon()}</button>
        </div>
      </div>
      <div class="order-card-data">
        <span>Quantidade <strong>${order.quantity}</strong></span>
        <span>Valor unitário <strong>${money(order.unitPrice)}</strong></span>
        <span>Pedido <strong>${money(total)}</strong></span>
        <span>Recebido <strong class="money-received">${money(order.received)}</strong></span>
        <span>Falta <strong class="money-pending">${money(pending)}</strong></span>
      </div>
      ${isEditingPrice ? `<form class="price-edit-form" data-edit-price-form="${escapeHtml(order.id)}">
        <label for="edit-price-${escapeHtml(order.id)}">Novo valor por produto</label>
        <div>
          <span aria-hidden="true">R$</span>
          <input id="edit-price-${escapeHtml(order.id)}" name="price" type="text" inputmode="numeric" autocomplete="off" placeholder="0,00" data-currency-input value="${formatPriceValue(order.unitPrice)}" required>
          <button class="action-button" type="submit">Salvar valor</button>
          <button class="action-button" type="button" data-cancel-price="${escapeHtml(order.id)}">Cancelar</button>
        </div>
      </form>` : ""}
      ${pending > 0 ? `<form class="payment-form" data-payment-form="${escapeHtml(order.id)}">
        <label for="payment-${escapeHtml(order.id)}">Adicionar recebimento</label>
        <div>
          <input id="payment-${escapeHtml(order.id)}" name="amount" type="text" inputmode="numeric" autocomplete="off" placeholder="0,00" data-currency-input required>
          <button class="action-button" type="submit">Registrar</button>
        </div>
      </form>` : '<p class="paid-note">Pedido pago</p>'}
    </article>`;
  }).join("");
}

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  if (form.matches("[data-edit-price-form]")) {
    event.preventDefault();
    const order = state.orders.find((item) => item.id === form.dataset.editPriceForm);
    if (!order) return;
    const price = parseCurrencyInput(new FormData(form).get("price"));
    if (!Number.isFinite(price) || price <= 0) {
      showMessage("Informe um valor por produto maior que zero.");
      return;
    }
    if (price * order.quantity < order.received) {
      showMessage(`O total do pedido não pode ser menor que o valor já recebido (${money(order.received)}).`);
      return;
    }
    const previousPrice = order.unitPrice;
    order.unitPrice = price;
    if (saveState()) {
      editingOrderId = null;
      render();
      showMessage("Valor deste pedido atualizado.");
    } else {
      order.unitPrice = previousPrice;
    }
    return;
  }

  if (!form.matches("[data-payment-form]")) return;
  event.preventDefault();

  const order = state.orders.find((item) => item.id === form.dataset.paymentForm);
  if (!order) return;
  const total = order.quantity * order.unitPrice;
  const remaining = Math.round((total - order.received) * 100) / 100;
  const amount = parseCurrencyInput(new FormData(form).get("amount"));
  if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
    showMessage(`Informe um valor maior que zero e até ${money(remaining)}.`);
    return;
  }
  order.received = Math.round((order.received + amount) * 100) / 100;
  if (saveState()) {
    render();
    showMessage(`Recebimento de ${money(amount)} registrado.`);
  }
});

function formatDate(value) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

priceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const price = parseCurrencyInput(new FormData(priceForm).get("price"));
  if (!Number.isFinite(price) || price <= 0) {
    showMessage("Informe um valor por produto maior que zero.");
    return;
  }

  state.unitPrice = Math.round(price * 100) / 100;
  if (saveState()) {
    editingUnitPrice = false;
    render();
    showMessage("Valor do produto atualizado.");
  }
});

editPriceButton.addEventListener("click", () => {
  editingUnitPrice = true;
  render();
  const input = document.querySelector("#unit-price");
  input.focus();
  input.select();
});

toggleOrderPriceButton.addEventListener("click", () => {
  orderPriceOverrideEnabled = true;
  orderPriceOverride.hidden = false;
  toggleOrderPriceButton.hidden = true;
  orderUnitPriceInput.value = state.unitPrice ? formatPriceValue(state.unitPrice) : "";
  updateOrderPreview();
  orderUnitPriceInput.focus();
  orderUnitPriceInput.select();
});

document.querySelector("#use-default-price").addEventListener("click", () => {
  orderPriceOverrideEnabled = false;
  orderPriceOverride.hidden = true;
  toggleOrderPriceButton.hidden = false;
  orderUnitPriceInput.value = "";
  updateOrderPreview();
});

orderQuantity.addEventListener("input", updateOrderPreview);
orderUnitPriceInput.addEventListener("input", updateOrderPreview);

pointForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = new FormData(pointForm).get("name").trim();
  if (!name) {
    showMessage("Informe o nome do ponto.");
    return;
  }

  state.points.push({ id: makeId(), name });
  if (saveState()) {
    activePointId = state.points[state.points.length - 1].id;
    pointForm.reset();
    render();
    showMessage(`Ponto ${name} adicionado.`);
    document.querySelector("#order-date").focus();
  }
});

orderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(orderForm);
  const pointId = activePointId;
  const date = formData.get("date");
  const quantity = Number(formData.get("quantity"));
  const unitPrice = orderPriceOverrideEnabled
    ? parseCurrencyInput(formData.get("unitPrice"))
    : state.unitPrice;
  const orderTotal = quantity * unitPrice;

  if (!state.points.some((point) => point.id === pointId)) {
    showMessage("Selecione um ponto válido.");
    return;
  }
  if (!date || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
    showMessage("Defina um valor de produto e informe a data e uma quantidade válida.");
    return;
  }

  state.orders.push({
    id: makeId(),
    pointId,
    date,
    quantity,
    unitPrice,
    received: 0,
  });
  if (saveState()) {
    orderForm.reset();
    orderPriceOverrideEnabled = false;
    orderPriceOverride.hidden = true;
    toggleOrderPriceButton.hidden = false;
    orderDate.value = localDate();
    render();
    showMessage("Pedido registrado.");
  }
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const openButton = target.closest("[data-open-point]");
  if (openButton) {
    activePointId = openButton.dataset.openPoint;
    editingOrderId = null;
    render();
    return;
  }

  if (target.closest("#back-to-points")) {
    activePointId = null;
    editingOrderId = null;
    render();
    return;
  }

  const editPriceButton = target.closest("[data-edit-price]");
  if (editPriceButton) {
    editingOrderId = editingOrderId === editPriceButton.dataset.editPrice ? null : editPriceButton.dataset.editPrice;
    render();
    if (editingOrderId) {
      const input = document.querySelector(`#edit-price-${CSS.escape(editingOrderId)}`);
      input.focus();
      input.select();
    }
    return;
  }

  if (target.closest("[data-cancel-price]")) {
    editingOrderId = null;
    render();
    return;
  }

  const pointButton = target.closest("[data-delete-point]");
  if (pointButton) {
    const point = state.points.find((item) => item.id === pointButton.dataset.deletePoint);
    if (!point) return;
    const relatedOrders = state.orders.filter((order) => order.pointId === point.id).length;
    requestDeletion("point", point.id, point.name, relatedOrders);
    return;
  }

  const orderButton = target.closest("[data-delete-order]");
  if (orderButton) {
    const order = state.orders.find((item) => item.id === orderButton.dataset.deleteOrder);
    if (order) requestDeletion("order", order.id, "");
  }
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element) || !editingUnitPrice || target.closest(".price-card")) return;
  editingUnitPrice = false;
  render();
});

document.querySelector("#cancel-delete").addEventListener("click", () => {
  deleteDialog.close();
  pendingDeletion = null;
});

deleteDialog.addEventListener("cancel", () => {
  pendingDeletion = null;
});

document.querySelector("#confirm-delete").addEventListener("click", confirmDeletion);

document.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches("[data-currency-input]")) return;
  const digits = input.value.replace(/\D/g, "");
  if (!digits) {
    input.value = "";
    return;
  }
  input.value = formatPriceValue(Number(digits) / 100);
  input.setSelectionRange(input.value.length, input.value.length);
});

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

orderDate.value = localDate();
render();
