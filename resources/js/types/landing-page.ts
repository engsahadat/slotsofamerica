export type SectionBackgroundType = "default" | "color" | "gradient" | "image";

export interface SectionBackground {
  background_type: SectionBackgroundType;
  background_color: string | null;
  background_gradient: string | null;
  background_image_url: string | null;
  text_color: string | null;
}

export interface LandingPageConfig {
  hero: SectionBackground & {
    badge_text: string;
    title_line1: string;
    title_highlight: string;
    title_line2: string;
    subtitle: string;
    trust_items: { label: string }[];
  };
  stats_banner: SectionBackground & {
    visible: boolean;
    stats: { value: string; label: string }[];
  };
  games_section: SectionBackground & {
    visible: boolean;
    title: string;
    subtitle: string;
  };
  transfers_section: SectionBackground & {
    visible: boolean;
    badge_text: string;
    title_line1: string;
    title_highlight: string;
    subtitle: string;
    cta_text: string;
    feature_image_url: string | null;
    actions: string[];
  };
  features_section: SectionBackground & {
    visible: boolean;
    title: string;
    subtitle: string;
    features: { title: string; desc: string; image_url: string | null }[];
  };
  testimonials_section: SectionBackground & {
    visible: boolean;
    title: string;
    subtitle: string;
    image_url: string | null;
    testimonials: { name: string; quote: string; avatar_url: string | null }[];
  };
  faq_section: SectionBackground & {
    visible: boolean;
    title: string;
    subtitle: string;
    faqs: { question: string; answer: string }[];
  };
  cta_section: SectionBackground & {
    visible: boolean;
    pre_title: string;
    title: string;
    button_text: string;
    image_url: string | null;
  };
  footer: SectionBackground & {
    show_games: boolean;
    copyright_text: string | null;
    extra_payment_methods: { name: string; logo_url: string }[];
  };
  navbar: {
    links: { label: string; href: string }[];
  };
}

const defaultBg: SectionBackground = {
  background_type: "default",
  background_color: null,
  background_gradient: null,
  background_image_url: null,
  text_color: null,
};

export const DEFAULT_LANDING_CONFIG: LandingPageConfig = {
  hero: {
    ...defaultBg,
    badge_text: "#1 Trusted Gaming Platform",
    title_line1: "YOUR WINNING",
    title_highlight: "JOURNEY",
    title_line2: "STARTS HERE",
    subtitle: "Sweepstakes, fish games, slots & more — all in one place. Register now and start winning today.",
    trust_items: [
      { label: "Secure & Encrypted" },
      { label: "Fast Approval" },
      { label: "Reliable System" },
    ],
  },
  stats_banner: {
    ...defaultBg,
    visible: true,
    stats: [
      { value: "10K+", label: "Active Players" },
      { value: "24/7", label: "Live Support" },
      { value: "$1M+", label: "Total Payouts" },
      { value: "50+", label: "Games Available" },
    ],
  },
  games_section: {
    ...defaultBg,
    visible: true,
    title: "OUR GAMES",
    subtitle: "Discover the best online gaming experience — play top industry games in one place.",
  },
  transfers_section: {
    ...defaultBg,
    visible: true,
    badge_text: "Lightning Fast",
    title_line1: "INSTANT FUND",
    title_highlight: "TRANSFERS",
    subtitle: "Deposit, Transfer, Redeem or Withdraw your funds instantly. No delays, no hassle — your money moves when you want it to.",
    cta_text: "Get Started Free",
    feature_image_url: null,
    actions: ["Deposit", "Withdraw", "Transfer", "Redeem"],
  },
  features_section: {
    ...defaultBg,
    visible: true,
    title: "WHY GAME WITH US?",
    subtitle: "The reasons players trust us",
    features: [
      { title: "Live 24/7 Support", desc: "Our dedicated team is always online to solve problems instantly.", image_url: null },
      { title: "Unlimited & Instant Withdrawals", desc: "Fast withdrawals to fulfill your needs.", image_url: null },
      { title: "Constant Community Bonuses", desc: "Get rewarded with free credits and exclusive promotions.", image_url: null },
      { title: "All Games in One Account", desc: "Play all of your favorite games under one account.", image_url: null },
    ],
  },
  testimonials_section: {
    ...defaultBg,
    visible: true,
    title: "WHAT PLAYERS SAY",
    subtitle: "Join thousands of satisfied gamers",
    image_url: null,
    testimonials: [
      { name: "Alex M.", quote: "Best gaming platform I've ever used! Fast payouts and amazing support.", avatar_url: null },
      { name: "Sarah K.", quote: "The variety of games is incredible. I play every day!", avatar_url: null },
      { name: "Mike R.", quote: "Deposits and withdrawals are instant. Highly recommended!", avatar_url: null },
    ],
  },
  faq_section: {
    ...defaultBg,
    visible: true,
    title: "FREQUENTLY ASKED QUESTIONS",
    subtitle: "Everything you need to know before getting started",
    faqs: [
      { question: "How do I create an account?", answer: "Simply click the Register button and fill in your details. It only takes a minute to get started!" },
      { question: "How long do deposits and withdrawals take?", answer: "Deposits are instant, and withdrawals are processed within minutes. No long waits!" },
      { question: "Is my personal information secure?", answer: "Absolutely. We use industry-standard encryption to protect all your data and transactions." },
      { question: "Can I play on mobile?", answer: "Yes! Our platform works on all devices — desktop, tablet, and mobile browsers." },
      { question: "How do I contact support?", answer: "Our 24/7 support team is always available. Use the live chat or reach out via email anytime." },
    ],
  },
  cta_section: {
    ...defaultBg,
    visible: true,
    pre_title: "Don't Miss Out",
    title: "REGISTER NOW & START PLAYING YOUR FAVORITE GAMES",
    button_text: "Register Now — It's Free",
    image_url: null,
  },
  footer: {
    ...defaultBg,
    show_games: true,
    copyright_text: null,
    extra_payment_methods: [],
  },
  navbar: {
    links: [
      { label: "Games", href: "#games" },
      { label: "Features", href: "#features" },
      { label: "Transfers", href: "#transfers" },
    ],
  },
};
