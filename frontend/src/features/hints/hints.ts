/**
 * Памятка игроку (решение Ивана 15.09): на экранах с развилками при первом заходе — одна
 * шторка, не больше экрана. Показывается один раз на устройстве.
 */
export interface RouteHint {
  id: string;
  title: string;
  steps: string[];
  matches: (pathname: string) => boolean;
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
    steps: [
      "«Запрос» — пополнить фишки, «Вывод» — вернуть фишки в деньги",
      "Выберите клуб плиткой и сумму — рядом эквивалент в рублях",
      "Кредитный игрок: менеджер выдаёт фишки, расчёт — раз в неделю",
      "Депозитный: придут реквизиты — 20 минут на оплату и скриншот",
      "Нужного клуба нет — «Аккаунты», привяжите свой ID",
    ],
    matches: (pathname) => pathname === "/chips",
  },
  {
    id: "accounts",
    title: "Аккаунт в клубе",
    steps: [
      "Выберите клуб — ниже появится ID клуба, чтобы найти его в приложении",
      "Укажите свой ник и ID аккаунта — они есть в профиле покерного приложения",
      "Менеджер проверит аккаунт — после этого можно заказывать фишки",
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
