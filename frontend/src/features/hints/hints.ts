/**
 * Памятка игроку (решение Ивана 15.09): на экранах с развилками при первом заходе — одна
 * шторка, не больше экрана. Показывается один раз на устройстве.
 */
/** Кредитный или депозитный путь игрока. Самих слов игрок не видит — это внутренняя метрика. */
export type PlayerKind = "credit" | "deposit" | null | undefined;

export interface RouteHint {
  id: string;
  title: string;
  steps: string[] | ((kind: PlayerKind) => string[]);
  matches: (pathname: string) => boolean;
}

export function hintSteps(hint: RouteHint, kind: PlayerKind): string[] {
  return typeof hint.steps === "function" ? hint.steps(kind) : hint.steps;
}

const REQUEST_PATH = /^\/chips\/[0-9a-f-]{36}$/i;

export const ROUTE_HINTS: RouteHint[] = [
  {
    id: "home",
    title: "Главная",
    steps: [
      "«Запросить фишки» — заявка в любой из ваших клубов, итог придёт уведомлением",
      "«Написать» — вопрос или разбор раздачи менеджеру",
      "Ниже — главные турниры дня и выигрыши игроков",
      "Установите Ginger на экран телефона — иначе уведомления не придут",
    ],
    matches: (pathname) => pathname === "/",
  },
  {
    id: "chips",
    title: "Фишки",
    // Игроку показываем только его собственный путь: кредитному про недельный расчёт,
    // депозитному про реквизиты (решение Ивана 27.09).
    steps: (kind) => [
      "«Запрос» — пополнить баланс, «Вывод» — вывести в рубли или крипту",
      "Выберите клуб плиткой и сумму — рядом эквивалент в рублях",
      kind === "deposit"
        ? "Реквизиты — 20 минут для оплаты и скриншот"
        : "Менеджер выдаёт фишки, расчёт — раз в неделю",
      "Нужного клуба нет? Привяжите свой ID в настройках профиля",
    ],
    matches: (pathname) => pathname === "/chips",
  },
  {
    id: "accounts",
    title: "Аккаунт в клубе",
    steps: [
      "Выберите клуб — ниже появится ID клуба, чтобы найти его в приложении",
      "Укажите свой ник и ID аккаунта — они есть в профиле покерного приложения",
      "Аккаунт сразу в работе: можно заказывать фишки. Ошиблись — «Изменить» в списке",
    ],
    matches: (pathname) => pathname === "/chips/accounts",
  },
  {
    id: "request",
    title: "Заявка на фишки",
    steps: [
      "Шкала сверху показывает, где сейчас заявка",
      "Пришли реквизиты — скопируйте, оплатите и приложите скриншот, пока идёт таймер",
      "Что-то не так — «Написать по заявке»: менеджер сразу увидит, о какой речь",
      "«Повторить» — такая же заявка в один тап",
    ],
    matches: (pathname) => REQUEST_PATH.test(pathname),
  },
  {
    id: "dialogs",
    title: "Диалоги",
    steps: [
      "Это не чат: у каждого вопроса своя тема и статус",
      "Менеджер отвечает в часы кассы — ответ появится здесь",
      "Разбор раздачи — приложите скриншот, так быстрее",
    ],
    matches: (pathname) => pathname === "/dialogs",
  },
  {
    id: "tournaments",
    title: "Турниры",
    steps: [
      "Время по Москве; «late» — сколько ещё открыта поздняя регистрация",
      "Тап по турниру — параметры, сателлиты и напоминание о старте",
      "Золотом — турниры с крупной гарантией",
      "Фильтр сверху — по стоимости входа",
    ],
    matches: (pathname) => pathname === "/tournaments",
  },
];

export function findRouteHint(pathname: string): RouteHint | null {
  return ROUTE_HINTS.find((hint) => hint.matches(pathname)) ?? null;
}

const SEEN_KEY = "ginger.hints.seen";

export function seenHints(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markHintSeen(id: string): void {
  try {
    const seen = seenHints();
    seen.add(id);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // хранилище недоступно — памятка покажется ещё раз, это не страшно
  }
}
