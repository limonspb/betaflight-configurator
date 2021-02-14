'use strict';

TABS.presets = {
    lineDelayMs: 15,
    profileSwitchDelayMs: 100,
    outputHistory: "",
    cliBuffer: "",
    GUI: {
        windowWrapper: null,
    },
    dumpValues: {},
    dumpCommands: [],
    isCollectingDump: false,
};

function presetsRemovePromptHash(promptText) {
    return promptText.replace(/^# /, '');
}

function presetsCliBufferCharsToDelete(command, buffer) {
    let commonChars = 0;
    for (let i = 0; i < buffer.length; i++) {
        if (command[i] === buffer[i]) {
            commonChars++;
        } else {
            break;
        }
    }

    return buffer.length - commonChars;
}

function presetsCommandWithBackSpaces(command, buffer, noOfCharsToDelete) {
    const backspace = String.fromCharCode(127);
    return backspace.repeat(noOfCharsToDelete) + command.substring(buffer.length - noOfCharsToDelete, command.length);
}

function presetsGetCliCommand(command, cliBuffer) {
    const buffer = presetsRemovePromptHash(cliBuffer);
    const bufferRegex = new RegExp('^' + buffer, 'g');

    if (command.match(bufferRegex)) {
        const result = command.replace(bufferRegex, '');
        return result;
    }

    const noOfCharsToDelete = presetsCliBufferCharsToDelete(command, buffer);
    const result = presetsCommandWithBackSpaces(command, buffer, noOfCharsToDelete);
    return result;
}

TABS.presets.initialize = function (callback) {
    const self = this;

    if (GUI.active_tab !== 'presets') {
        GUI.active_tab = 'presets';
    }

    self.outputHistory = "";
    self.cliBuffer = "";

    const enterKeyCode = 13;

    function executeCommands(outString) {
        const outputArray = outString.split("\n");
        Promise.reduce(outputArray, function(delay, line, index) {
            return new Promise(function (resolve) {
                GUI.timeout_add('CLI_send_slowly', function () {
                    let processingDelay = self.lineDelayMs;
                    line = line.trim();
                    if (line.toLowerCase().startsWith('profile')) {
                        processingDelay = self.profileSwitchDelayMs;
                    }
                    const isLastCommand = outputArray.length === index + 1;
                    if (isLastCommand && self.cliBuffer) {
                        line = presetsGetCliCommand(line, self.cliBuffer);
                    }
                    self.sendLine(line, function () {
                        resolve(processingDelay);
                    });
                }, delay);
            });
        }, 0);
    }

    $('#content').load("./tabs/presets/presets.html", function () {
        // translate to user-selected language
        i18n.localizePage();

        TABS.presets.adaptPhones();

        CONFIGURATOR.presetsActive = true;

        self.GUI.windowWrapper = $('.tab-presets .window .wrapper');

        const textarea = $('.tab-presets textarea[name="commands"]');

        // Tab key detection must be on keydown,
        // `keypress`/`keyup` happens too late, as `textarea` will have already lost focus.
        textarea.keydown(function (event) {
            const tabKeyCode = 9;
            if (event.which === tabKeyCode) {
                // prevent default tabbing behaviour
                event.preventDefault();
            }
        });

        textarea.keypress(function (event) {
            if (event.which === enterKeyCode) {
                event.preventDefault(); // prevent the adding of new line

                const outString = textarea.val();
                executeCommands(outString);
                textarea.val('');
            }
        });

        // give input element user focus
        textarea.focus();

        GUI.timeout_add('enter_presets', function enter_presets() {
            // Enter CLI mode
            const bufferOut = new ArrayBuffer(1);
            const bufView = new Uint8Array(bufferOut);

            bufView[0] = 0x23; // #

            serial.send(bufferOut);
        }, 250);

        //TABS.presets.requestCurrentSettings();
        GUI.content_ready(callback);
    });
};

TABS.presets.requestCurrentSettings = function()
{
    TABS.presets.isCollectingDump = true;
    TABS.presets.sendLine("dump", null);
    TABS.presets.fcSettings = new PresetsFcSettings();
}

TABS.presets.adaptPhones = function() {
    if ($(window).width() < 575) {
        const backdropHeight = $('.note').height() + 22 + 38;
        $('.backdrop').css('height', `calc(100% - ${backdropHeight}px)`);
    }

    if (GUI.isCordova()) {
        UI_PHONES.initToolbar();
    }
};


function presetsWriteToOutput(text) {
    const windowWrapper = TABS.presets.GUI.windowWrapper;
    windowWrapper.append(text);
    $('.tab-presets .window').scrollTop(windowWrapper.height());
}

function presetsWriteLineToOutput(text) {
    if (text.startsWith("###ERROR")) {
        presetsWriteToOutput(`<span class="error_message">${text}</span><br>`);
    } else {
        if (TABS.presets.isCollectingDump) {
            TABS.presets.fcSettings.addLine(text);
        }
        presetsWriteToOutput(text + "<br>");
    }
}

TABS.presets.read = function (readInfo) {
    console.log("================== TABS.presets.read");
    /*  Some info about handling line feeds and carriage return

        line feed = LF = \n = 0x0A = 10
        carriage return = CR = \r = 0x0D = 13

        MAC only understands CR
        Linux and Unix only understand LF
        Windows understands (both) CRLF
        Chrome OS currently unknown
    */
    console.log(readInfo.data);
    const data = new Uint8Array(readInfo.data);
    let validateText = "";
    let sequenceCharsToSkip = 0;

    for (let i = 0; i < data.length; i++) {
        const currentChar = String.fromCharCode(data[i]);

        if (!CONFIGURATOR.presetsValid) {
            // try to catch part of valid CLI enter message
            validateText += currentChar;
            presetsWriteToOutput(currentChar);
            continue;
        }

        const escapeSequenceCode = 27;
        const escapeSequenceCharLength = 3;
        if (data[i] === escapeSequenceCode && !sequenceCharsToSkip) { // ESC + other
            sequenceCharsToSkip = escapeSequenceCharLength;
        }

        if (sequenceCharsToSkip) {
            sequenceCharsToSkip--;
            continue;
        }

        switch (data[i]) {
            case lineFeedCode:
                if (GUI.operating_system === "Windows") {
                    presetsWriteLineToOutput(this.cliBuffer);
                    this.cliBuffer = "";
                }
                break;
            case carriageReturnCode:
                if (GUI.operating_system !== "Windows") {
                    presetsWriteLineToOutput(this.cliBuffer);
                    this.cliBuffer = "";
                }
                break;
            case 60:
                this.cliBuffer += '&lt';
                break;
            case 62:
                this.cliBuffer += '&gt';
                break;
            case backspaceCode:
                this.cliBuffer = this.cliBuffer.slice(0, -1);
                this.outputHistory = this.outputHistory.slice(0, -1);
                continue;

            default:
                this.cliBuffer += currentChar;
        }

        if (this.cliBuffer === 'Rebooting') {
            CONFIGURATOR.presetsActive = false;
            CONFIGURATOR.presetsValid = false;
            GUI.log(i18n.getMessage('cliReboot'));
            reinitialiseConnection(self);
        }

    }

    if (!CONFIGURATOR.presetsValid && validateText.indexOf('CLI') !== -1) {
        GUI.log(i18n.getMessage('cliEnter'));
        CONFIGURATOR.presetsValid = true;
        // begin output history with the prompt (last line of welcome message)
        // this is to match the content of the history with what the user sees on this tab
        const lastLine = validateText.split("\n").pop();
        this.outputHistory = lastLine;
        TABS.presets.requestCurrentSettings();
    }
};

TABS.presets.sendLine = function (line, callback) {
    this.send(line + '\n', callback);
};

TABS.presets.send = function (line, callback) {
    const bufferOut = new ArrayBuffer(line.length);
    const bufView = new Uint8Array(bufferOut);

    for (let cKey = 0; cKey < line.length; cKey++) {
        bufView[cKey] = line.charCodeAt(cKey);
    }

    serial.send(bufferOut, callback);
};

TABS.presets.cleanup = function (callback) {
    TABS.presets.dumpValues = {};
    TABS.presets.dumpCommands = [];

    if (!(CONFIGURATOR.connectionValid && CONFIGURATOR.presetsActive && CONFIGURATOR.presetsValid)) {
        if (callback) {
            callback();
        }

        return;
    }
    this.send(presetsGetCliCommand('exit\r', this.cliBuffer), function () {
        // we could handle this "nicely", but this will do for now
        // (another approach is however much more complicated):
        // we can setup an interval asking for data lets say every 200ms, when data arrives, callback will be triggered and tab switched
        // we could probably implement this someday
        if (callback) {
            callback();
        }

        CONFIGURATOR.presetsActive = false;
        CONFIGURATOR.presetsValid = false;
    });
};
