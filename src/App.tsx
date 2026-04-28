import { type DragEvent, type FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  DEFAULT_TAX_RATE,
  TAX_RATES,
  calculateTaxExcludedPrice,
  calculateTaxIncludedPrice,
  isTaxRate,
  type TaxRate,
} from "./lib/tax";
import { supabase } from "./lib/supabase";
import ebiIcon from "./icon/ebi.png";

const LOGIN_ERROR_MESSAGE = "ログインできませんでした";
const FETCH_EVENTS_ERROR_MESSAGE = "データの取得に失敗しました";
const SAVE_EVENT_ERROR_MESSAGE = "保存に失敗しました";
const FETCH_ITEMS_ERROR_MESSAGE = "データの取得に失敗しました";
const SAVE_ITEM_ERROR_MESSAGE = "保存に失敗しました";
const VALIDATION_ERROR_MESSAGE = "入力内容を確認してください";

type EventViewMode = "shopping" | "report";

type BbqEvent = {
  id: string;
  name: string;
  year: number;
  budget: number;
  note: string | null;
  status: "active" | "completed";
  created_at: string;
  updated_at: string;
};

type ShoppingItem = {
  id: string;
  event_id: string;
  name: string;
  category: string | null;
  planned_quantity: number | null;
  actual_quantity: number | null;
  unit_price: number | null;
  actual_price: number | null;
  actual_price_excluding_tax: number | null;
  tax_rate: TaxRate;
  last_year_price: number | null;
  last_year_price_excluding_tax: number | null;
  note: string | null;
  is_checked: boolean;
  is_extra: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type PriceInputMode = "taxIncluded" | "taxExcluded";

const eventSelectColumns =
  "id,name,year,budget,note,status,created_at,updated_at";
const shoppingItemSelectColumns =
  "id,event_id,name,category,planned_quantity,actual_quantity,unit_price,actual_price,actual_price_excluding_tax,tax_rate,last_year_price,last_year_price_excluding_tax,note,is_checked,is_extra,sort_order,created_at,updated_at";

const getCurrentYear = () => new Date().getFullYear();

const formatYen = (amount: number) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);

const parseOptionalNumber = (value: string) => {
  if (!value.trim()) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null;
};

const parseOptionalInteger = (value: string) => {
  if (!value.trim()) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : null;
};

export function App() {
  const isSupabaseConfigured = Boolean(supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [events, setEvents] = useState<BbqEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [eventName, setEventName] = useState("");
  const [eventYear, setEventYear] = useState(String(getCurrentYear()));
  const [eventBudget, setEventBudget] = useState("0");
  const [eventNote, setEventNote] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [itemName, setItemName] = useState("");
  const [priceInputModes, setPriceInputModes] = useState<
    Record<string, PriceInputMode>
  >({});
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [eventViewMode, setEventViewMode] =
    useState<EventViewMode>("shopping");
  const [isCompletingEvent, setIsCompletingEvent] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  const selectedEvent =
    events.find((bbqEvent) => bbqEvent.id === selectedEventId) ?? null;

  useEffect(() => {
    if (!supabase) {
      setIsCheckingSession(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session);
        setIsCheckingSession(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setEvents([]);
        setSelectedEventId(null);
        setShoppingItems([]);
        setPriceInputModes({});
      }
      setIsCheckingSession(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadEvents = async () => {
    if (!supabase || !session) {
      return;
    }

    setIsLoadingEvents(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("events")
      .select(eventSelectColumns)
      .order("year", { ascending: false })
      .order("created_at", { ascending: false });

    setIsLoadingEvents(false);

    if (error) {
      setEvents([]);
      setSelectedEventId(null);
      setShoppingItems([]);
      setErrorMessage(FETCH_EVENTS_ERROR_MESSAGE);
      return;
    }

    setEvents(data ?? []);
  };

  const loadShoppingItems = async (eventId: string) => {
    if (!supabase || !session) {
      return;
    }

    setIsLoadingItems(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("shopping_items")
      .select(shoppingItemSelectColumns)
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    setIsLoadingItems(false);

    if (error) {
      setShoppingItems([]);
      setErrorMessage(FETCH_ITEMS_ERROR_MESSAGE);
      return;
    }

    setShoppingItems(data ?? []);
  };

  useEffect(() => {
    if (session) {
      void loadEvents();
    }
  }, [session]);

  useEffect(() => {
    if (!selectedEvent) {
      setShoppingItems([]);
      return;
    }

    void loadShoppingItems(selectedEvent.id);
  }, [selectedEvent?.id]);

  useEffect(() => {
    if (selectedEvent) {
      setBudgetDraft(String(selectedEvent.budget));
    }
  }, [selectedEvent?.id, selectedEvent?.budget]);

  useEffect(() => {
    if (!isCreateEventOpen) {
      return;
    }

    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape" && !isCreatingEvent) {
        setErrorMessage("");
        setIsCreateEventOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isCreateEventOpen, isCreatingEvent]);

  useEffect(() => {
    if (!supabase || !session || !selectedEvent) {
      return;
    }

    const supabaseClient = supabase;
    const channel = supabaseClient
      .channel(`shopping-items-${selectedEvent.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shopping_items",
          filter: `event_id=eq.${selectedEvent.id}`,
        },
        () => {
          void loadShoppingItems(selectedEvent.id);
        },
      )
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [session, selectedEvent?.id]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const normalizedLoginId = loginId.trim();

    if (!supabase || !normalizedLoginId || !password) {
      setErrorMessage(LOGIN_ERROR_MESSAGE);
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: `${normalizedLoginId}@bbq.local`,
      password,
    });

    setPassword("");
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(LOGIN_ERROR_MESSAGE);
    }
  };

  const handleLogout = async () => {
    if (!supabase) {
      return;
    }

    setIsMenuOpen(false);
    setIsSigningOut(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signOut();

    setIsSigningOut(false);

    if (error) {
      setErrorMessage("ログアウトできませんでした");
    }
  };

  const handleCreateEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const normalizedName = eventName.trim();
    const normalizedNote = eventNote.trim();
    const parsedYear = Number(eventYear);
    const parsedBudget = Number(eventBudget);

    if (
      !supabase ||
      !session ||
      !normalizedName ||
      !Number.isInteger(parsedYear) ||
      parsedYear < 2000 ||
      parsedYear > 2100 ||
      !Number.isInteger(parsedBudget) ||
      parsedBudget < 0
    ) {
      setErrorMessage(VALIDATION_ERROR_MESSAGE);
      return;
    }

    setIsCreatingEvent(true);

    const { error } = await supabase.from("events").insert({
      name: normalizedName,
      year: parsedYear,
      budget: parsedBudget,
      note: normalizedNote || null,
    });

    setIsCreatingEvent(false);

    if (error) {
      setErrorMessage(SAVE_EVENT_ERROR_MESSAGE);
      return;
    }

    setEventName("");
    setEventYear(String(getCurrentYear()));
    setEventBudget("0");
    setEventNote("");
    setIsCreateEventOpen(false);
    await loadEvents();
  };

  const handleOpenCreateEvent = () => {
    setErrorMessage("");
    setEventName("");
    setEventYear(String(getCurrentYear()));
    setEventBudget("0");
    setEventNote("");
    setIsMenuOpen(false);
    setIsCreateEventOpen(true);
  };

  const handleCloseCreateEvent = () => {
    if (isCreatingEvent) {
      return;
    }
    setErrorMessage("");
    setIsCreateEventOpen(false);
  };

  const resetItemForm = () => {
    setItemName("");
  };

  const handleOpenEvent = (bbqEvent: BbqEvent) => {
    setErrorMessage("");
    resetItemForm();
    setEventViewMode("shopping");
    setSelectedEventId(bbqEvent.id);
  };

  const handleBackToEvents = () => {
    setErrorMessage("");
    setIsMenuOpen(false);
    resetItemForm();
    setEventViewMode("shopping");
    setSelectedEventId(null);
    setShoppingItems([]);
  };

  const handleBudgetBlur = async () => {
    if (!supabase || !session || !selectedEvent) {
      return;
    }

    const trimmedDraft = budgetDraft.trim();
    const parsedBudget = Number(trimmedDraft);

    if (
      !trimmedDraft ||
      !Number.isInteger(parsedBudget) ||
      parsedBudget < 0
    ) {
      setErrorMessage(VALIDATION_ERROR_MESSAGE);
      setBudgetDraft(String(selectedEvent.budget));
      return;
    }

    if (parsedBudget === selectedEvent.budget) {
      return;
    }

    setErrorMessage("");
    setIsSavingBudget(true);

    const eventId = selectedEvent.id;

    setEvents((currentEvents) =>
      currentEvents.map((currentEvent) =>
        currentEvent.id === eventId
          ? { ...currentEvent, budget: parsedBudget }
          : currentEvent,
      ),
    );

    const { error } = await supabase
      .from("events")
      .update({ budget: parsedBudget })
      .eq("id", eventId);

    setIsSavingBudget(false);

    if (error) {
      setErrorMessage(SAVE_EVENT_ERROR_MESSAGE);
      await loadEvents();
    }
  };

  const handleSaveItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const normalizedName = itemName.trim();

    if (!supabase || !session || !selectedEvent || !normalizedName) {
      setErrorMessage(VALIDATION_ERROR_MESSAGE);
      return;
    }

    setIsSavingItem(true);

    const { error } = await supabase.from("shopping_items").insert({
      name: normalizedName,
      event_id: selectedEvent.id,
      is_extra: true,
      sort_order: shoppingItems.length,
      tax_rate: DEFAULT_TAX_RATE,
    });

    setIsSavingItem(false);

    if (error) {
      setErrorMessage(SAVE_ITEM_ERROR_MESSAGE);
      return;
    }

    resetItemForm();
    await loadShoppingItems(selectedEvent.id);
  };

  const saveShoppingItemPatch = async (
    item: ShoppingItem,
    itemPayload: Partial<
      Pick<
        ShoppingItem,
        | "name"
        | "actual_price"
        | "actual_price_excluding_tax"
        | "actual_quantity"
        | "is_checked"
        | "sort_order"
        | "tax_rate"
      >
    >,
  ) => {
    if (!supabase || !session || !selectedEvent) {
      return;
    }

    setErrorMessage("");
    setShoppingItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === item.id
          ? { ...currentItem, ...itemPayload }
          : currentItem,
      ),
    );

    const { error } = await supabase
      .from("shopping_items")
      .update(itemPayload)
      .eq("id", item.id)
      .eq("event_id", selectedEvent.id);

    if (error) {
      setErrorMessage(SAVE_ITEM_ERROR_MESSAGE);
      await loadShoppingItems(selectedEvent.id);
    }
  };

  const getItemTaxRate = (item: ShoppingItem) =>
    isTaxRate(item.tax_rate) ? item.tax_rate : DEFAULT_TAX_RATE;

  const getItemPriceInputMode = (item: ShoppingItem) =>
    priceInputModes[item.id] ?? "taxIncluded";

  const getItemQuantityValue = (item: ShoppingItem) =>
    item.actual_quantity ?? item.planned_quantity ?? "";

  const getItemNumericQuantity = (item: ShoppingItem) =>
    item.actual_quantity ?? item.planned_quantity;

  const itemHasPrice = (item: ShoppingItem) =>
    item.actual_price !== null || item.actual_price_excluding_tax !== null;

  const shouldAutoCheckItem = (
    quantity: number | null,
    taxIncludedPrice: number | null,
    taxExcludedPrice: number | null,
  ) => quantity !== null && (taxIncludedPrice !== null || taxExcludedPrice !== null);

  const getItemPriceInputValue = (item: ShoppingItem) => {
    const inputMode = getItemPriceInputMode(item);

    if (inputMode === "taxExcluded") {
      return item.actual_price_excluding_tax ?? "";
    }

    return item.actual_price ?? "";
  };

  const getItemCalculatedPriceLabel = (item: ShoppingItem) => {
    const inputMode = getItemPriceInputMode(item);

    if (inputMode === "taxExcluded") {
      return `税込 ${formatYen(item.actual_price ?? 0)}`;
    }

    return `税抜 ${formatYen(item.actual_price_excluding_tax ?? 0)}`;
  };

  const handleItemCheckedChange = async (
    item: ShoppingItem,
    isChecked: boolean,
  ) => {
    await saveShoppingItemPatch(item, { is_checked: isChecked });
  };

  const handleItemNameBlur = async (item: ShoppingItem, value: string) => {
    const normalizedName = value.trim();

    if (!normalizedName) {
      setErrorMessage(VALIDATION_ERROR_MESSAGE);
      return;
    }

    if (normalizedName === item.name) {
      return;
    }

    await saveShoppingItemPatch(item, { name: normalizedName });
  };

  const handleItemQuantityChange = async (item: ShoppingItem, value: string) => {
    const actualQuantity = parseOptionalNumber(value);
    const hasInvalidQuantity = value.trim() && actualQuantity === null;

    if (hasInvalidQuantity) {
      setErrorMessage(VALIDATION_ERROR_MESSAGE);
      return;
    }

    await saveShoppingItemPatch(item, {
      actual_quantity: actualQuantity,
      is_checked: shouldAutoCheckItem(
        actualQuantity,
        item.actual_price,
        item.actual_price_excluding_tax,
      ),
    });
  };

  const handleItemPriceModeChange = (
    item: ShoppingItem,
    inputMode: PriceInputMode,
  ) => {
    setPriceInputModes((currentModes) => ({
      ...currentModes,
      [item.id]: inputMode,
    }));
  };

  const handleItemPriceChange = async (
    item: ShoppingItem,
    value: string,
  ) => {
    const price = parseOptionalInteger(value);
    const hasInvalidPrice = value.trim() && price === null;

    if (hasInvalidPrice) {
      setErrorMessage(VALIDATION_ERROR_MESSAGE);
      return;
    }

    const inputMode = getItemPriceInputMode(item);
    const actualPrice =
      price === null
        ? null
        : inputMode === "taxIncluded"
          ? price
          : calculateTaxIncludedPrice(price, getItemTaxRate(item));
    const actualPriceExcludingTax =
      price === null
        ? null
        : inputMode === "taxExcluded"
          ? price
          : calculateTaxExcludedPrice(price, getItemTaxRate(item));

    await saveShoppingItemPatch(item, {
      actual_price_excluding_tax: actualPriceExcludingTax,
      actual_price: actualPrice,
      is_checked: shouldAutoCheckItem(
        getItemNumericQuantity(item),
        actualPrice,
        actualPriceExcludingTax,
      ),
    });
  };

  const handleItemTaxRateChange = async (item: ShoppingItem, taxRate: TaxRate) => {
    const itemPayload: Partial<
      Pick<
        ShoppingItem,
        "actual_price" | "actual_price_excluding_tax" | "tax_rate"
      >
    > = {
      tax_rate: taxRate,
    };

    if (item.actual_price !== null) {
      itemPayload.actual_price_excluding_tax = calculateTaxExcludedPrice(
        item.actual_price,
        taxRate,
      );
    } else if (item.actual_price_excluding_tax !== null) {
      itemPayload.actual_price = calculateTaxIncludedPrice(
        item.actual_price_excluding_tax,
        taxRate,
      );
    }

    await saveShoppingItemPatch(item, {
      ...itemPayload,
      is_checked: shouldAutoCheckItem(
        getItemNumericQuantity(item),
        itemPayload.actual_price ?? item.actual_price,
        itemPayload.actual_price_excluding_tax ?? item.actual_price_excluding_tax,
      ),
    });
  };

  const handleDeleteItem = async (item: ShoppingItem) => {
    if (!supabase || !session || !selectedEvent) {
      return;
    }

    setErrorMessage("");
    setIsSavingItem(true);

    const { error } = await supabase
      .from("shopping_items")
      .delete()
      .eq("id", item.id)
      .eq("event_id", selectedEvent.id);

    setIsSavingItem(false);

    if (error) {
      setErrorMessage(SAVE_ITEM_ERROR_MESSAGE);
      return;
    }

    await loadShoppingItems(selectedEvent.id);
  };

  const handleItemDragStart = (
    event: DragEvent<HTMLButtonElement>,
    itemId: string,
  ) => {
    setDraggedItemId(itemId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
  };

  const handleItemDragOver = (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleItemDrop = async (
    event: DragEvent<HTMLLIElement>,
    targetItemId: string,
  ) => {
    event.preventDefault();

    if (!supabase || !session || !selectedEvent) {
      setDraggedItemId(null);
      return;
    }

    const supabaseClient = supabase;
    const sourceItemId =
      draggedItemId || event.dataTransfer.getData("text/plain");

    if (!sourceItemId || sourceItemId === targetItemId) {
      setDraggedItemId(null);
      return;
    }

    const sourceIndex = shoppingItems.findIndex(
      (item) => item.id === sourceItemId,
    );
    const targetIndex = shoppingItems.findIndex(
      (item) => item.id === targetItemId,
    );

    if (sourceIndex < 0 || targetIndex < 0) {
      setDraggedItemId(null);
      return;
    }

    const nextItems = [...shoppingItems];
    const [movedItem] = nextItems.splice(sourceIndex, 1);
    nextItems.splice(targetIndex, 0, movedItem);

    const reorderedItems = nextItems.map((item, index) => ({
      ...item,
      sort_order: index,
    }));

    setDraggedItemId(null);
    setErrorMessage("");
    setShoppingItems(reorderedItems);

    const updateResults = await Promise.all(
      reorderedItems.map((item) =>
        supabaseClient
          .from("shopping_items")
          .update({ sort_order: item.sort_order })
          .eq("id", item.id)
          .eq("event_id", selectedEvent.id),
      ),
    );

    if (updateResults.some((result) => result.error)) {
      setErrorMessage(SAVE_ITEM_ERROR_MESSAGE);
      await loadShoppingItems(selectedEvent.id);
    }
  };

  const handleItemDragEnd = () => {
    setDraggedItemId(null);
  };

  const handleCompleteEvent = async () => {
    if (!supabase || !session || !selectedEvent) {
      return;
    }

    setErrorMessage("");
    setIsCompletingEvent(true);

    const eventId = selectedEvent.id;

    setEvents((currentEvents) =>
      currentEvents.map((currentEvent) =>
        currentEvent.id === eventId
          ? { ...currentEvent, status: "completed" }
          : currentEvent,
      ),
    );

    const { error } = await supabase
      .from("events")
      .update({ status: "completed" })
      .eq("id", eventId);

    setIsCompletingEvent(false);

    if (error) {
      setErrorMessage(SAVE_EVENT_ERROR_MESSAGE);
      await loadEvents();
    }
  };

  const checkedPurchaseTotal = shoppingItems.reduce(
    (total, item) => total + (item.is_checked ? item.actual_price ?? 0 : 0),
    0,
  );
  const remainingBudget =
    selectedEvent === null ? 0 : selectedEvent.budget - checkedPurchaseTotal;
  const reportItemGroups = shoppingItems.reduce(
    (groups, item) => {
      if (item.is_checked) {
        groups.purchased.push(item);
      } else {
        groups.unpurchased.push(item);
      }

      return groups;
    },
    {
      purchased: [] as ShoppingItem[],
      unpurchased: [] as ShoppingItem[],
    },
  );
  const purchasedItemCount = reportItemGroups.purchased.length;
  const unpurchasedItemCount = reportItemGroups.unpurchased.length;
  const getItemTaxExcludedPrice = (item: ShoppingItem) =>
    item.actual_price_excluding_tax ??
    (item.actual_price === null
      ? null
      : calculateTaxExcludedPrice(item.actual_price, getItemTaxRate(item)));
  const getItemQuantityLabel = (item: ShoppingItem) => {
    const quantity = getItemNumericQuantity(item);
    return quantity === null ? "数量未入力" : `数量 ${quantity}`;
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <img src={ebiIcon} alt="" className="brand-icon" aria-hidden="true" />
          <h1 id="app-title">お買い物リスト</h1>
        </div>
        {session && (
          <div className="menu-wrap">
            <button
              type="button"
              className="menu-button"
              aria-label="メニュー"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((current) => !current)}
            >
              <span aria-hidden="true">☰</span>
            </button>
            {isMenuOpen && (
              <div className="menu-popover">
                {selectedEvent ? (
                  <button
                    type="button"
                    className="menu-item"
                    onClick={handleBackToEvents}
                  >
                    一覧へ戻る
                  </button>
                ) : (
                  <button
                    type="button"
                    className="menu-item"
                    onClick={handleOpenCreateEvent}
                  >
                    新規イベント作成
                  </button>
                )}
                <button
                  type="button"
                  className="menu-item"
                  onClick={handleLogout}
                  disabled={isSigningOut}
                >
                  {isSigningOut ? "ログアウト中" : "ログアウト"}
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <main className="app-body" aria-labelledby="app-title">
        {isCheckingSession ? (
          <p className="status-message" role="status">
            ログイン状態を確認しています。
          </p>
        ) : session ? (
          <>
            {selectedEvent ? (
              <div className="detail-layout">
                <section
                  className="event-summary"
                  aria-labelledby="event-detail-title"
                >
                  <div>
                    <h2 id="event-detail-title">{selectedEvent.name}</h2>
                    <p>{selectedEvent.year}年</p>
                    {selectedEvent.note && <p>{selectedEvent.note}</p>}
                    <div className="event-detail-actions">
                      <span className="status-badge">
                        {selectedEvent.status === "completed"
                          ? "完了"
                          : "進行中"}
                      </span>
                      {eventViewMode === "shopping" ? (
                        <>
                          <button
                            type="button"
                            className="secondary-button compact-button"
                            onClick={handleCompleteEvent}
                            disabled={
                              isCompletingEvent ||
                              selectedEvent.status === "completed"
                            }
                          >
                            {selectedEvent.status === "completed"
                              ? "終了済み"
                              : isCompletingEvent
                                ? "終了中"
                                : "終了"}
                          </button>
                          <button
                            type="button"
                            className="secondary-button compact-button"
                            onClick={() => setEventViewMode("report")}
                            disabled={selectedEvent.status !== "completed"}
                          >
                            収支報告
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="secondary-button compact-button"
                          onClick={() => setEventViewMode("shopping")}
                        >
                          買い物リストへ戻る
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="purchase-summary" aria-label="購入状況">
                    <label className="summary-card featured budget-card">
                      <span>予算</span>
                      <div className="budget-input-row">
                        <span className="budget-currency" aria-hidden="true">
                          ¥
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          className="budget-input"
                          value={budgetDraft}
                          onChange={(formEvent) =>
                            setBudgetDraft(formEvent.target.value)
                          }
                          onBlur={handleBudgetBlur}
                          onFocus={(formEvent) => formEvent.target.select()}
                          min="0"
                          step="1"
                          disabled={isSavingBudget}
                          aria-label="予算"
                        />
                      </div>
                    </label>
                    <div className="summary-line">
                      <span>購入済み合計</span>
                      <strong>{formatYen(checkedPurchaseTotal)}</strong>
                    </div>
                    <div className="summary-line summary-line-remaining">
                      <span>あと購入できる金額</span>
                      <strong>{formatYen(remainingBudget)}</strong>
                    </div>
                  </div>
                </section>

                {eventViewMode === "report" ? (
                  <section className="report-view" aria-labelledby="report-title">
                    <div className="section-header">
                      <div>
                        <h2 id="report-title">収支報告</h2>
                        <p className="section-lead">
                          税込価格を基準に購入合計を計算しています。
                        </p>
                      </div>
                    </div>

                    <div className="report-summary-grid" aria-label="収支概要">
                      <div className="summary-card">
                        <span>予算</span>
                        <strong>{formatYen(selectedEvent.budget)}</strong>
                      </div>
                      <div className="summary-card">
                        <span>購入合計</span>
                        <strong>{formatYen(checkedPurchaseTotal)}</strong>
                      </div>
                      <div
                        className={
                          remainingBudget < 0
                            ? "summary-card over-budget"
                            : "summary-card"
                        }
                      >
                        <span>{remainingBudget < 0 ? "不足額" : "残金"}</span>
                        <strong>
                          {formatYen(
                            remainingBudget < 0
                              ? Math.abs(remainingBudget)
                              : remainingBudget,
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="report-lists">
                      <section
                        className="report-section"
                        aria-labelledby="purchased-items-title"
                      >
                        <h3 id="purchased-items-title">
                          購入済み商品 ({purchasedItemCount})
                        </h3>
                        {purchasedItemCount > 0 ? (
                          <ul className="report-item-list">
                            {reportItemGroups.purchased.map((item) => (
                              <li className="report-item" key={item.id}>
                                <div>
                                  <strong>{item.name}</strong>
                                  <span>{getItemQuantityLabel(item)}</span>
                                </div>
                                <div className="report-price">
                                  <strong>
                                    {formatYen(item.actual_price ?? 0)}
                                  </strong>
                                  <span>
                                    税抜{" "}
                                    {formatYen(getItemTaxExcludedPrice(item) ?? 0)}
                                    {" / "}
                                    {getItemTaxRate(item)}%
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="empty-state compact-empty">
                            <img src={ebiIcon} alt="" aria-hidden="true" />
                            <p>購入済み商品はありません。</p>
                          </div>
                        )}
                      </section>

                      <section
                        className="report-section"
                        aria-labelledby="unpurchased-items-title"
                      >
                        <h3 id="unpurchased-items-title">
                          未購入商品 ({unpurchasedItemCount})
                        </h3>
                        {unpurchasedItemCount > 0 ? (
                          <ul className="report-item-list">
                            {reportItemGroups.unpurchased.map((item) => (
                              <li className="report-item" key={item.id}>
                                <div>
                                  <strong>{item.name}</strong>
                                  <span>{getItemQuantityLabel(item)}</span>
                                </div>
                                <div className="report-price">
                                  {itemHasPrice(item) ? (
                                    <>
                                      <strong>
                                        {formatYen(item.actual_price ?? 0)}
                                      </strong>
                                      <span>
                                        税抜{" "}
                                        {formatYen(
                                          getItemTaxExcludedPrice(item) ?? 0,
                                        )}
                                        {" / "}
                                        {getItemTaxRate(item)}%
                                      </span>
                                    </>
                                  ) : (
                                    <span>金額未入力</span>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="empty-state compact-empty">
                            <img src={ebiIcon} alt="" aria-hidden="true" />
                            <p>未購入商品はありません。</p>
                          </div>
                        )}
                      </section>
                    </div>
                  </section>
                ) : (
                  <div className="shopping-layout">
                  <form className="quick-add-form" onSubmit={handleSaveItem}>
                    <h2>商品追加</h2>
                    <label>
                      商品名
                      <div className="quick-add-row">
                        <input
                          type="text"
                          name="itemName"
                          value={itemName}
                          onChange={(formEvent) =>
                            setItemName(formEvent.target.value)
                          }
                          disabled={isSavingItem}
                          required
                          maxLength={120}
                        />
                        <button
                          type="submit"
                          className="add-item-button"
                          disabled={isSavingItem}
                          aria-label="商品を追加"
                        >
                          +
                        </button>
                      </div>
                    </label>
                  </form>

                  <section className="item-list-section" aria-labelledby="item-list">
                    <div className="section-header">
                      <h2 id="item-list">買い物リスト</h2>
                    </div>
                    {isLoadingItems ? (
                      <p className="status-message" role="status">
                        データを取得しています。
                      </p>
                    ) : shoppingItems.length > 0 ? (
                      <ul className="item-list">
                        {shoppingItems.map((item) => (
                          <li
                            className={
                              [
                                "shopping-item",
                                item.is_checked ? "is-checked" : "",
                                draggedItemId === item.id ? "is-dragging" : "",
                              ]
                                .join(" ")
                                .trim()
                            }
                            key={item.id}
                            onDragOver={handleItemDragOver}
                            onDrop={(dragEvent) =>
                              handleItemDrop(dragEvent, item.id)
                            }
                          >
                            <button
                              type="button"
                              className="delete-item-button"
                              onClick={() => handleDeleteItem(item)}
                              disabled={isSavingItem}
                              aria-label={`${item.name}を削除`}
                            >
                              ×
                            </button>
                            <div className="shopping-item-main">
                              <div className="item-heading-row">
                                <button
                                  type="button"
                                  className="drag-handle-button"
                                  draggable
                                  onDragStart={(dragEvent) =>
                                    handleItemDragStart(dragEvent, item.id)
                                  }
                                  onDragEnd={handleItemDragEnd}
                                  aria-label={`${item.name}の表示順を移動`}
                                  title="ドラッグして並び替え"
                                >
                                  ⋮⋮
                                </button>
                                <div className="item-title-row">
                                  <input
                                    type="checkbox"
                                    checked={item.is_checked}
                                    onChange={(formEvent) =>
                                      handleItemCheckedChange(
                                        item,
                                        formEvent.target.checked,
                                      )
                                    }
                                    aria-label={`${item.name}を購入済みにする`}
                                  />
                                  <input
                                    type="text"
                                    className="item-name-input"
                                    defaultValue={item.name}
                                    onBlur={(formEvent) =>
                                      handleItemNameBlur(
                                        item,
                                        formEvent.target.value,
                                      )
                                    }
                                    onKeyDown={(keyboardEvent) => {
                                      if (keyboardEvent.key === "Enter") {
                                        keyboardEvent.currentTarget.blur();
                                      }
                                    }}
                                    maxLength={120}
                                    aria-label={`${item.name}の商品名`}
                                  />
                                </div>
                              </div>
                              <div className="inline-item-inputs">
                                <label className="item-field">
                                  数量
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={getItemQuantityValue(item)}
                                    onChange={(formEvent) =>
                                      handleItemQuantityChange(
                                        item,
                                        formEvent.target.value,
                                      )
                                    }
                                    onFocus={(formEvent) =>
                                      formEvent.target.select()
                                    }
                                    min="0"
                                    step="0.01"
                                  />
                                </label>
                                <label className="item-field">
                                  金額
                                  <div className="price-input-group">
                                    <select
                                      value={getItemPriceInputMode(item)}
                                      onChange={(formEvent) =>
                                        handleItemPriceModeChange(
                                          item,
                                          formEvent.target
                                            .value as PriceInputMode,
                                        )
                                      }
                                      aria-label={`${item.name}の金額種別`}
                                    >
                                      <option value="taxIncluded">税込</option>
                                      <option value="taxExcluded">税抜</option>
                                    </select>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      value={getItemPriceInputValue(item)}
                                      onChange={(formEvent) =>
                                        handleItemPriceChange(
                                          item,
                                          formEvent.target.value,
                                        )
                                      }
                                      onFocus={(formEvent) =>
                                        formEvent.target.select()
                                      }
                                      min="0"
                                      step="1"
                                    />
                                  </div>
                                </label>
                              </div>
                              <div className="inline-item-meta">
                                <div className="inline-tax-rate" aria-label="税率">
                                  {TAX_RATES.map((taxRate) => (
                                    <button
                                      key={taxRate}
                                      type="button"
                                      className={
                                        getItemTaxRate(item) === taxRate
                                          ? "tax-rate-button active compact-button"
                                          : "tax-rate-button compact-button"
                                      }
                                      onClick={() =>
                                        handleItemTaxRateChange(item, taxRate)
                                      }
                                      aria-pressed={
                                        getItemTaxRate(item) === taxRate
                                      }
                                    >
                                      {taxRate}%
                                    </button>
                                  ))}
                                </div>
                                {itemHasPrice(item) && (
                                  <span className="calculated-price">
                                    {getItemCalculatedPriceLabel(item)}
                                  </span>
                                )}
                              </div>
                              {item.note && <p>{item.note}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="empty-state">
                        <img src={ebiIcon} alt="" aria-hidden="true" />
                        <p>商品はまだ登録されていません。</p>
                      </div>
                    )}
                  </section>
                </div>
                )}
              </div>
            ) : (
              <section
                className="event-list-section event-home"
                aria-labelledby="event-list"
              >
                <h2 id="event-list">イベント一覧</h2>
                {isLoadingEvents ? (
                  <p className="status-message" role="status">
                    データを取得しています。
                  </p>
                ) : events.length > 0 ? (
                  <ul className="event-list">
                    {events.map((bbqEvent) => (
                      <li className="event-item" key={bbqEvent.id}>
                        <div>
                          <h3>{bbqEvent.name}</h3>
                          <p>
                            {bbqEvent.year}年 / 予算{" "}
                            {formatYen(bbqEvent.budget)}
                          </p>
                          {bbqEvent.note && <p>{bbqEvent.note}</p>}
                        </div>
                        <div className="event-actions">
                          <span className="status-badge">
                            {bbqEvent.status === "completed"
                              ? "完了"
                              : "進行中"}
                          </span>
                          <button
                            type="button"
                            className="secondary-button compact-button"
                            onClick={() => handleOpenEvent(bbqEvent)}
                          >
                            開く
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty-state">
                    <img src={ebiIcon} alt="" aria-hidden="true" />
                    <p>
                      表示できるイベントはありません。メニューから新規イベントを作成してください。
                    </p>
                  </div>
                )}
              </section>
            )}

            {isCreateEventOpen && (
              <div
                className="modal-backdrop"
                onClick={handleCloseCreateEvent}
                role="presentation"
              >
                <div
                  className="modal-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="create-event-title"
                  onClick={(modalEvent) => modalEvent.stopPropagation()}
                >
                  <header className="modal-header">
                    <h2 id="create-event-title">新規イベント作成</h2>
                    <button
                      type="button"
                      className="modal-close"
                      onClick={handleCloseCreateEvent}
                      aria-label="閉じる"
                      disabled={isCreatingEvent}
                    >
                      ×
                    </button>
                  </header>
                  <form className="event-form" onSubmit={handleCreateEvent}>
                    <label>
                      イベント名
                      <input
                        type="text"
                        name="eventName"
                        value={eventName}
                        onChange={(formEvent) =>
                          setEventName(formEvent.target.value)
                        }
                        disabled={isCreatingEvent}
                        required
                        maxLength={120}
                        autoFocus
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        開催年
                        <input
                          type="number"
                          name="eventYear"
                          value={eventYear}
                          onChange={(formEvent) =>
                            setEventYear(formEvent.target.value)
                          }
                          disabled={isCreatingEvent}
                          min="2000"
                          max="2100"
                          step="1"
                          required
                        />
                      </label>
                      <label>
                        予算
                        <input
                          type="number"
                          name="eventBudget"
                          value={eventBudget}
                          onChange={(formEvent) =>
                            setEventBudget(formEvent.target.value)
                          }
                          disabled={isCreatingEvent}
                          min="0"
                          step="1"
                          required
                        />
                      </label>
                    </div>
                    <label>
                      メモ
                      <textarea
                        name="eventNote"
                        value={eventNote}
                        onChange={(formEvent) =>
                          setEventNote(formEvent.target.value)
                        }
                        disabled={isCreatingEvent}
                        maxLength={2000}
                      />
                    </label>
                    {errorMessage && (
                      <p className="error-message" role="alert">
                        {errorMessage}
                      </p>
                    )}
                    <div className="modal-form-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={handleCloseCreateEvent}
                        disabled={isCreatingEvent}
                      >
                        キャンセル
                      </button>
                      <button type="submit" disabled={isCreatingEvent}>
                        {isCreatingEvent ? "作成中" : "作成"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="auth-wrapper">
            <img
              src={ebiIcon}
              alt=""
              className="auth-icon"
              aria-hidden="true"
            />
            <p className="lead">ID とパスワードを入力してください。</p>

            <form className="login-form" onSubmit={handleLogin}>
              <label>
                ID
                <input
                  type="text"
                  name="loginId"
                  autoComplete="username"
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value)}
                  disabled={!isSupabaseConfigured || isSubmitting}
                />
              </label>
              <label>
                パスワード
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={!isSupabaseConfigured || isSubmitting}
                />
              </label>
              <button
                type="submit"
                disabled={!isSupabaseConfigured || isSubmitting}
              >
                {isSubmitting ? "ログイン中" : "ログイン"}
              </button>
            </form>
          </div>
        )}

        {!isSupabaseConfigured && (
          <p className="status-message">
            Supabase 環境変数は未設定です。.env.example を参考に設定してください。
          </p>
        )}

        {errorMessage && (
          <p className="error-message" role="alert">
            {errorMessage}
          </p>
        )}
      </main>
    </div>
  );
}
