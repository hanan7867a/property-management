const now = new Date();

/** The calendar month the device is currently in, as YYYY-MM. */
export const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
