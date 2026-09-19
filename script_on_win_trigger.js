
// Adjust token ids
const adjust_Ad10_session3 = "r59icf";
const adjust_RV10_ret7 = "klxr4q";
const adjust_RV3_session5_ret3 = "9n2tp3";
const adjust_RV5_iap1 = "bdheaa";
const adjust_IAP = "ncc1o1";

if (persistent.adjustEventsSent === undefined) {
    persistent.adjustEventsSent = {};
}

// NOTE: 1st version of tracking was using event name instead of event token, so we detect it and resend all the events
if (persistent.adjustFixedName === undefined) {
    persistent.adjustFixedName = true;
    persistent.adjustEventsSent = {}; // Reset
    persistent.lastInappPurchasedCount = 0;
}

function sendAdjustTrackingOnce(condition, eventStr) {
    if (!condition)
        return;

    if (persistent.adjustEventsSent[eventStr] != undefined)
        return;

    sendAdjustTrackingEvent(eventStr);
    persistent.adjustEventsSent[eventStr] = true;
}

function sendAdjustLevelTracking(level) {
    switch (level) {
        case    5: sendAdjustTrackingOnce(true, "9vbt2g"); break;
        case   10: sendAdjustTrackingOnce(true, "adv4hl"); break;
        case   15: sendAdjustTrackingOnce(true, "dcihdh"); break;
        case   20: sendAdjustTrackingOnce(true, "qitxx7"); break;
        case   25: sendAdjustTrackingOnce(true, "migxzz"); break;
        case   40: sendAdjustTrackingOnce(true, "okefnw"); break;
        case   55: sendAdjustTrackingOnce(true, "c6l2x1"); break;
        case   75: sendAdjustTrackingOnce(true, "g5274d"); break;
        case  100: sendAdjustTrackingOnce(true, "dwtqw9"); break;
        case  125: sendAdjustTrackingOnce(true, "ophhkx"); break;
        case  150: sendAdjustTrackingOnce(true, "azufwp"); break;
        case  200: sendAdjustTrackingOnce(true, "72w4vg"); break;
        case  250: sendAdjustTrackingOnce(true, "2jtt19"); break;
        case  350: sendAdjustTrackingOnce(true, "634txt"); break;
        case  500: sendAdjustTrackingOnce(true, "9vls2q"); break;
        case  750: sendAdjustTrackingOnce(true, "jflg6r"); break;
        case 1000: sendAdjustTrackingOnce(true, "r4n86c"); break;
    }
}

// Send adjust level tracking
if (persistent.adjustPreviousLevelTrackingSent === undefined) {
    persistent.adjustPreviousLevelTrackingSent = true;
    for (let i = 1; i <= player.level_progress; ++i) {
        sendAdjustLevelTracking(i);
    }
} else {
    sendAdjustLevelTracking(player.level_progress);
}

// Retrieve info
var sessionCount = countEvents(ET_SESSION_START, EVENT_FLAG_ALL, 0);
var interCount = countEvents(ET_AD_INTER_IMPR, EVENT_FLAG_ALL, 0);
var rvCount = countEvents(ET_AD_REWARDED_COMPLETED, EVENT_FLAG_ALL, 0);
var inappPurchasedCount = countEvents(ET_INAPP_PURCHASED, EVENT_FLAG_ALL, 0);
var installDate = firstEventDate(ET_SESSION_START, EVENT_FLAG_ALL, 0);
var daysSinceInstall = (NOW - installDate) / DAYS;

// Send tracking
sendAdjustTrackingOnce(interCount >= 10 && sessionCount >= 3, adjust_Ad10_session3);
sendAdjustTrackingOnce(rvCount >= 10 && daysSinceInstall >= 7, adjust_RV10_ret7);
sendAdjustTrackingOnce(rvCount >= 3 && sessionCount >= 5 && daysSinceInstall >= 3, adjust_RV3_session5_ret3);
sendAdjustTrackingOnce(rvCount >= 5 && inappPurchasedCount >= 1, adjust_RV5_iap1);

// Send IAP every time there is a new inapp (one per purchase)
for (let i = (persistent.lastInappPurchasedCount ?? 0); i < inappPurchasedCount; ++i) {
    sendAdjustTrackingEvent(adjust_IAP);
}
persistent.lastInappPurchasedCount = inappPurchasedCount;
