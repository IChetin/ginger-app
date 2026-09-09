/**
 * Поиск элементов шире вьюпорта. В консоли:
 * `[...document.querySelectorAll('*')].filter(el => el.scrollWidth > document.documentElement.clientWidth)`
 * Чеклист: `document.body.scrollWidth === document.documentElement.clientWidth`
 */
export function findWiderThanViewport(
  root: ParentNode = document,
  viewportWidth: number = document.documentElement.clientWidth,
): Element[] {
  return [...root.querySelectorAll("*")].filter((el) => el.scrollWidth > viewportWidth);
}

export function hasHorizontalPageScroll(): boolean {
  return document.body.scrollWidth > document.documentElement.clientWidth;
}
