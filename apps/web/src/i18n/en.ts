import type { Messages } from './bs';

export const en: Messages = {
  meta: {
    title: 'qafe – QR ordering for cafés',
  },
  nav: {
    howItWorks: 'How it works',
    forVenues: 'For venues',
    forGuests: 'For guests',
    faq: 'FAQ',
    staffLogin: 'Staff login',
    cta: 'Request a demo',
    menu: 'Menu',
    close: 'Close',
    language: 'Language',
    palette: 'Colour palette',
  },
  hero: {
    eyebrow: 'QR ordering for cafés and restaurants',
    titleA: 'The order arrives',
    titleB: 'before the waiter.',
    subtitle:
      'Guests scan the QR code on the table, pick from the menu and send. Waiters see the order in under 2 seconds, accept it with one tap, and the whole team instantly knows who took the table.',
    ctaPrimary: 'Request a demo',
    ctaSecondary: 'See how it works',
    badges: ['No app for guests', 'No new hardware', 'Bosnian and English'],
  },
  demo: {
    venue: 'Demo Café',
    table: 'Table 7',
    items: [
      { name: 'Espresso', price: 2.5 },
      { name: 'Cappuccino', price: 3.5 },
      { name: 'Homemade lemonade', price: 4 },
      { name: 'Croissant', price: 3 },
    ],
    currency: 'KM',
    add: 'Add',
    send: 'Send order',
    callWaiter: 'Call waiter',
    total: 'Total',
    sent: 'Sent',
    accepted: 'Accepted',
    staffTitle: 'Orders',
    staffZone: 'All zones',
    newOrder: 'New order',
    accept: 'Accept',
    acceptedBy: 'Accepted by Amar',
    waitingFor: 'just now',
    guestPhone: "Guest's phone",
    staffPhone: "Waiter's phone",
  },
  ticker: [
    'Table 3 · 2× Espresso · accepted by Amar',
    'Terrace 5 · asks for the bill',
    'Table 12 · calls a waiter',
    'Hall 8 · Lemonade, Croissant · accepted by Lejla',
    'Table 1 · paid · table free',
    'Terrace 2 · 3× Cappuccino · accepted by Emir',
  ],
  how: {
    eyebrow: 'How it works',
    title: 'From QR code to a free table.',
    subtitle: 'Four steps. No waving across the room, no waiting to catch the waiter’s eye.',
    steps: [
      {
        title: 'Scan',
        body: 'The guest scans the QR code on the table. The venue’s menu opens in the browser, no install, no sign-up.',
      },
      {
        title: 'Order',
        body: 'They pick items and extras, leave a note and send. A waiter is also one tap away.',
      },
      {
        title: 'Accept',
        body: 'The order reaches every waiter live. The first to accept takes it, and everyone else sees who did.',
      },
      {
        title: 'Pay',
        body: 'The guest asks for the bill, the waiter takes payment and closes the table. The session ends and the table is free again.',
      },
    ],
    screens: {
      scanHint: 'Point the camera at the QR code',
      orderSent: 'Order sent',
      acceptedBy: 'Accepted by Amar',
      billRequested: 'Table 7 asks for the bill',
      paid: 'Paid',
      tableFree: 'Table 7 is free',
    },
  },
  stats: {
    title: 'Numbers every shift can feel.',
    items: [
      {
        prefix: '< ',
        value: 2,
        suffix: ' s',
        label: 'from sending an order to the waiter’s screen',
      },
      { prefix: '', value: 0, suffix: '', label: 'duplicate orders, even when a guest taps twice' },
      {
        prefix: '< ',
        value: 60,
        suffix: ' s',
        label: 'to the first order, no instructions needed',
      },
      { prefix: '', value: 0, suffix: '', label: 'new devices: staff phones are enough' },
    ],
  },
  features: {
    eyebrow: 'For venues',
    title: 'Everything a venue needs. Nothing in the way.',
    subtitle:
      'You set up the menu, tables and staff. qafe makes sure every order reaches the right person at the right moment.',
    items: [
      {
        key: 'live',
        title: 'Live orders',
        body: 'Sound, vibration and a push notification for every new order, waiter call and bill request.',
      },
      {
        key: 'claim',
        title: 'One order, one waiter',
        body: 'When someone accepts an order, everyone sees who. Nobody runs to the same table twice.',
      },
      {
        key: 'menu',
        title: 'A menu you edit yourself',
        body: 'Categories, extras, photos and prices. Mark a sold-out item as unavailable with one click.',
      },
      {
        key: 'tables',
        title: 'Zones, tables and QR codes',
        body: 'Terrace, hall, bar. Export QR codes to a printable PDF, and revoke any of them.',
      },
      {
        key: 'staff',
        title: 'Staff and roles',
        body: 'An account for every waiter and a PIN for shared devices. You decide who may cancel or reject.',
      },
      {
        key: 'reports',
        title: 'Reports',
        body: 'Revenue by day, waiter, item and hour, compared with the previous period. Export to CSV, Excel and PDF.',
      },
      {
        key: 'safety',
        title: 'Protection from the next table’s pranks',
        body: 'The first order needs confirmation, new devices need approval, and guests can flag an order as “Not ours”.',
      },
      {
        key: 'kds',
        title: 'Bar and kitchen display (KDS)',
        body: 'An optional prep screen with waiting times and a colour warning when something runs late.',
      },
    ],
  },
  guests: {
    eyebrow: 'For guests',
    title: 'Sit. Scan. Enjoy.',
    body: 'No app, no sign-up and no waving across the room. Order when you are ready and follow your order live.',
    points: [
      'Menu with photos, descriptions and prices',
      'Live order status, from sent to served',
      'Call a waiter or ask for the bill with one tap',
    ],
    venuesTitle: 'Where you can order with qafe',
    venuesEmpty: 'The first venues are joining qafe soon. Look for the qafe QR code on your table.',
    venuesOwnerCta: 'Own a venue? Be among the first.',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'What owners ask first.',
    items: [
      {
        q: 'Do guests need to install an app?',
        a: 'No. The QR code opens the menu in the phone’s browser. No install, no sign-up.',
      },
      {
        q: 'What do we need to get started?',
        a: 'Staff phones and printed QR codes. The staff app runs in the browser and can be added to the home screen.',
      },
      {
        q: 'Can someone order for another table?',
        a: 'The first order of a new session goes to a waiter for confirmation, new devices at a table need approval, and guests can flag a suspicious order as “Not ours”. The waiter always has the final say.',
      },
      {
        q: 'What if the internet goes down?',
        a: 'The staff app shows the last known state and remembers actions, then syncs them as soon as the connection is back.',
      },
      {
        q: 'How do guests pay?',
        a: 'The guest asks for the bill and picks cash or card, depending on what the venue offers. The waiter takes payment and closes the table.',
      },
      {
        q: 'Is our venue’s data kept apart from others?',
        a: 'Yes. Every venue sees only its own data, and that isolation is enforced in the database itself.',
      },
    ],
  },
  cta: {
    title: 'Let the orders come to you.',
    body: 'Get in touch and we will set up the menu, tables and QR codes for your venue together.',
    primary: 'Request a demo',
    secondary: 'Write to us',
    mailSubject: 'qafe demo',
  },
  footer: {
    tagline: 'QR ordering for cafés and restaurants.',
    staffLogin: 'Staff login',
    panel: 'Venue panel',
    rights: 'All rights reserved.',
  },
};
