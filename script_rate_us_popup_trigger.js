if (POPUP_INSERT_POINT != POPUP_INSERT_BEFORE_WIN)
    return false; // Only display before win screen

var firstLevelDisplayed = 7;

if (player.level_progress < firstLevelDisplayed) {
    return false;
}

if (persistent.rateUsAnsweredLowDate || persistent.rateUsAnsweredHighDate)
    return false; // Already answered

if (countEvents(ET_RATING_POPUP_CLOSED, RATING_POPUP_ANSWERED_LOW_FLAG) >= 1) {
    persistent.rateUsAnsweredLowDate = lastEventDate(ET_RATING_POPUP_CLOSED, RATING_POPUP_ANSWERED_LOW_FLAG);
    return false; // Already answered (1-4)
}

if (countEvents(ET_RATING_POPUP_CLOSED, RATING_POPUP_ANSWERED_HIGH_FLAG) >= 1) {
    persistent.rateUsAnsweredHighDate = lastEventDate(ET_RATING_POPUP_CLOSED, RATING_POPUP_ANSWERED_HIGH_FLAG);
    return false; // Already answered (5)
}

var cancelledCount = countEvents(ET_RATING_POPUP_CLOSED, RATING_POPUP_CANCELLED_FLAG);

// First time display
if (player.level_progress == firstLevelDisplayed && cancelledCount == 0) {
    return true;
}

// Do not display anymore if cancelled 3 times
if (cancelledCount >= 3) {
    return false;
}

// Case that happens for old players that are already level > firstLevelDisplayed
// AND for players that have close the popup
var winsThisSession = countEvents(ET_GAME_WIN, EVENT_FLAG_ALL, SESSION_START);
if (winsThisSession == 2) {
    if (NOW - lastEventDate(ET_RATING_POPUP_CLOSED, RATING_POPUP_CANCELLED_FLAG) > 1 * DAYS) {
        return true;
    }
}

return false;
