import type { AppSettings } from "@/lib/types";

export const appSettings: AppSettings = {
  approvalLimit: 10000,
  reminderTemplates: {
    en: "Dear {tenant}, rent for {unit} is pending. Balance: {amount}. Please pay today.",
    ur: "{tenant} صاحب، {unit} کا کرایہ باقی ہے۔ رقم: {amount}۔ براہ کرم آج ادا کریں۔",
  },
  closedMonths: [],
};
