// Disable ads for player until level 3
if (player.level_progress <= 3) {
    return false;
}

var adDelay = 120;
var adCapping = 180;

// Relaxing capping/delay if it happens during gameplay
if (POPUP_INSERT_POINT == POPUP_INSERT_AFTER_FAMILY_COMPLETED) {
    // Disable until level 10 (7 is rating popup)
    if (player.level_progress < 10) {
        return false;
    }
    adDelay = 200;
    adCapping = 240;
    // Increase capping 30 seconds for each ads displayed during this game
    var adsThisGame = countEvents(ET_AD_INTER_IMPR, 2, lastEventDate(ET_GAME_START));
    adCapping += 30 * adsThisGame;
}

var freqMultiplier = 1.0;
var playerLevel = player.level_progress;
// playerLevel = 30; // For debug

// Ramp from level 3 to level 10
freqMultiplier *= remap(playerLevel, 3, 10, 0.5, 1.0);

// Increase rate when player has play more than 30 minutes, until max rate at 3 hours
var todayPlaytime = playtimeRelative(1 * DAYS);
// todayPlaytime = 3 * HOURS; // For debug
freqMultiplier *= remap(todayPlaytime, 30 * MINS, 3 * HOURS, 1.0, 1.25);

if (freqMultiplier <= 0.0) // Should not happens
    freqMultiplier = 0.1;

adDelay /= freqMultiplier;
adCapping /= freqMultiplier;

// return adCapping // For debug
return (SECONDS_SINCE_LAST_AD > adCapping && playtimeRelative(10 * MINS) > adDelay);