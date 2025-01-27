export {
  secondsToDisplayDuration,
  saveToStorage,
  getFromStorage,
  timeToTimestamp,
  sort,
  zeropad,
  pad,
  formatDuration,
  formatTimestamp,
  runIfFn,
};

/**
 * Converts the given amount of total seconds to a display format (e.g. 2d5h6m1s)
 * For example, input 100950 would yield 1d4h2m30s
 * @param {number} totalSeconds The seconds to convert to XhYmZs format
 * @param {{showDays: boolean, showHours: boolean, showMinutes: boolean, showSeconds: boolean}} parts Specify which parts to show in the output
 */
function secondsToDisplayDuration(
  totalSeconds,
  { showDays = true, showHours = true, showMinutes = true, showSeconds = true } = {}
) {
  const isNegative = totalSeconds < 0;

  let seconds = Math.abs(totalSeconds);

  const components = [
    { label: "d", sec: 24 * 60 * 60, show: showDays },
    { label: "h", sec: 60 * 60, show: showHours },
    { label: "m", sec: 60, show: showMinutes },
    { label: "s", sec: 1, show: showSeconds },
  ].filter(v => v.show);

  let output = "";
  const last = components[components.length - 1];
  for (const component of components) {
    const value = Math.floor(seconds / component.sec);
    seconds %= component.sec;

    if (value > 0 || (!output && component === last)) {
      output += value + component.label;
    }
  }

  return (isNegative ? "-" : "") + output;
}

function saveToStorage(key, value) {
  if (!window.localStorage) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function getFromStorage(key) {
  if (!window.localStorage) {
    return null;
  }

  try {
    var value = window.localStorage.getItem(key);
    return JSON.parse(value);
  } catch (err) {
    console.error(err);
  }
}

function runIfFn(fn, thisArg) {
  if (typeof fn === "function") {
    var args = [].slice.apply(arguments).slice(2);
    fn.apply(thisArg, args);
  }
}

/**
 * Zeropads the given number (or string).
 * @param {string|number} nr Number to zeropad
 * @param {number} length Length to pad to
 */
function zeropad(nr, length) {
  return pad(nr, "0", length);
}

/**
 * Pads the given input string from the left with the given character until the input string reaches the specified length
 * @param {number|string} input String to pad
 * @param {string} char Pad character
 * @param {number} length Length to pad input to
 * @returns {string} Padded string
 */
function pad(input, char, length) {
  // Force to string
  let str = `${input}`;
  while (str.length < length) {
    str = char + str;
  }
  return str;
}

/**
 * Converts the given time string to a timestamp. Only supports HH:mm and interprets it as a time of the current day in the local timezone.
 * @param {string} time Time string to convert to a timestamp.
 */
function timeToTimestamp(time) {
  const timeRe = /^([012]?[0-9]):?([0-5][0-9])$/;
  const matches = timeRe.exec(time);

  if (matches == null || matches.length !== 3) {
    if (time) {
      console.warn(`Invalid time string, should match RegExp ${timeRe} but got "${time}"`);
    }

    return null;
  }

  const hr = parseInt(matches[1], 10);
  const min = parseInt(matches[2], 10);

  const dt = new Date();
  dt.setHours(hr);
  dt.setMinutes(min);
  dt.setSeconds(0, 0);

  return dt.getTime();
}

function formatDuration(
  duration,
  { showZero = true, showSeconds = true, showMinutes = true, showHours = true, showDays = true } = {}
) {
  const rounded = Math.round(duration);
  const format = secondsToDisplayDuration(rounded, {
    showDays,
    showSeconds,
    showMinutes,
    showHours,
  });

  if (!showZero && /^-?0[dhms]$/.test(format)) {
    return null;
  } else {
    return format;
  }
}

function formatTimestamp(timestamp, outputIfInvalid) {
  if (typeof timestamp !== "number") {
    if (timestamp != null) {
      // User did pass in something so warn about wrong input here.
      console.warn(`Timestamp should be a number, but got a ${typeof timestamp}`);
    }

    return outputIfInvalid;
  }

  const date = new Date(timestamp);

  var hours = date.getHours();
  var minutes = date.getMinutes();

  return zeropad(hours, 2) + ":" + zeropad(minutes, 2);
}

function sort(array, selector) {
  return array.sort((a, b) => {
    const vA = selector(a);
    const vB = selector(b);
    return vA > vB ? 1 : vB > vA ? -1 : 0;
  });
}
