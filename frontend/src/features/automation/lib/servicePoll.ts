/**
 * How often an open job dialog asks again whether its server answers, so a server that stops or
 * starts shows without reopening. The polls are silent: only the first ask after opening shows
 * as checking, and later ones change the status only when the answer changes.
 */
export const SERVICE_POLL_MS = 5_000;
