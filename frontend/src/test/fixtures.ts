import type {
  EventDetail,
  ScheduleFiltersResponse,
  SeriesDetail,
  SeriesListItem,
} from "@/api/types/schedule";

export const filtersFixture: ScheduleFiltersResponse = {
  countries: [{ code: "RU", name_ru: "Россия" }],
  zones: ["Красная Поляна"],
  organizers: [{ id: "org-1", name: "RPT", slug: "rpt", logo_url: null }],
  statuses: ["announced", "schedule_published", "running", "finished", "cancelled"],
  game_types: ["nlh", "plo", "plo5", "mixed", "other"],
  tags: ["main"],
};

export const seriesItemFixture: SeriesListItem = {
  id: "series-1",
  slug: "rpt-demo",
  name: "RPT Demo",
  starts_on: "2026-08-01",
  ends_on: "2026-08-07",
  status: "schedule_published",
  poster_url: null,
  organizer: { id: "org-1", name: "RPT", slug: "rpt", logo_url: null },
  venue: {
    id: "venue-1",
    name: "Красная Поляна",
    city: "Сочи",
    country_code: "RU",
    zone: "Красная Поляна",
    timezone: "Europe/Moscow",
    address: null,
  },
  country: { code: "RU", name_ru: "Россия" },
  events_count: 3,
  days_until_start: 5,
  min_buyins: [{ amount: "11000.00", currency: { code: "RUB", symbol: "₽" } }],
  today_events_count: null,
  highlight: null,
};

export const seriesDetailFixture: SeriesDetail = {
  ...seriesItemFixture,
  description: "Demo series",
  links: {},
  events_by_day: [
    {
      date: "2026-08-01",
      events: [
        {
          id: "event-1",
          slug: "1-main-event",
          number: 1,
          name: "Main Event",
          buyin: "55000.00",
          buyin_bounty: null,
          currency: { code: "RUB", symbol: "₽" },
          guarantee: "30000000.00",
          game_type: "nlh",
          tags: ["main"],
          status: "scheduled",
          start_stack: 40000,
          start_blinds: null,
          reentry_count: 1,
          reentry_unlimited: false,
          late_reg_level: 8,
          day_end_note: null,
          flights: [
            {
              id: "flight-1",
              label: "A",
              start_at: {
                utc: "2026-08-01T11:00:00+00:00",
                venue_local: "2026-08-01T14:00:00+03:00",
                venue_timezone: "Europe/Moscow",
              },
            },
          ],
        },
      ],
    },
  ],
};

export const eventDetailFixture: EventDetail = {
  id: "event-1",
  slug: "1-main-event",
  number: 1,
  name: "Main Event",
  buyin: "55000.00",
  buyin_bounty: null,
  currency: { code: "RUB", symbol: "₽" },
  guarantee: "30000000.00",
  game_type: "nlh",
  tags: ["main"],
  start_stack: 40000,
  start_blinds: null,
  reentry_count: 1,
  reentry_unlimited: false,
  late_reg_level: 8,
  day_end_note: null,
  status: "scheduled",
  notes: null,
  series: seriesItemFixture,
  venue: seriesItemFixture.venue,
  country: seriesItemFixture.country,
  flights: seriesDetailFixture.events_by_day[0].events[0].flights,
  blind_levels: [
    {
      level_no: 1,
      structure_set_label: "default",
      sb: 100,
      bb: 200,
      ante: 200,
      minutes: 20,
      is_break: false,
      is_late_reg_end: false,
    },
  ],
};
