'use strict';

class MotorRemapComponent
{
    constructor(contentDiv, onLoadedCallback, droneConfiguration, motorStopValue, motorSpinValue)
    {
        this._contentDiv = contentDiv;
        this._onLoadedCallback = onLoadedCallback;
        this._droneConfiguration = droneConfiguration;
        this._motorStopValue = motorStopValue;
        this._motorSpinValue = motorSpinValue;
        this._config = new MotorRemapConfig(100);

        this._currentJerkingTimeout = -1;
        this._currentJerkingMotor = -1;

        this._currentSpinningMotor = -1;

        this._contentDiv.load("./components/motor_remap/body.html", () => {
            this._setupdialog();
        });
    }

    _readDom()
    {
        this._domAgreeSafetyCheckBox = $('#motorsEnableTestMode-dialogMotorRemap');
        this._domAgreeButton = $('#dialogMotorRemapAgreeButton');
        this._domStartOverButton = $('#motorsRemapDialogStartOver');
        this._domSaveButton = $('#motorsRemapDialogSave');
        this._domMainContentBlock = $('#dialogMotorRemapMainContent');
        this._domWarningContentBlock = $('#dialogMotorRemapWarning');
        this._domActionHintBlock = $('#motorRemapActionHint');
        this._domCanvas = $('#motorRemapCanvas');
    }

    _setupdialog()
    {
        i18n.localizePage();
        this._readDom();

        this._resetGui();

        this._domAgreeSafetyCheckBox.change(() =>
        {
            let enabled = this._domAgreeSafetyCheckBox.is(':checked');

            if (enabled) {
                this._domAgreeButton.show();
            } else {
                this._domAgreeButton.hide();
            }
        });

        this._domAgreeButton.click(() => {
            this._onAgreeButtonClicked();
        });
        this._domStartOverButton.click(() => {
            this._startOver();
        });
        this._domSaveButton.click(() => {
            this._save();
        });

        this._onLoadedCallback();
    }

    close()
    {
        this._stopAnyMotorJerking();
        this._stopMotor();
        this._stopUserInteraction();
        this._resetGui();
    }

    _resetGui()
    {
        this._domMainContentBlock.hide();
        this._domWarningContentBlock.show();
        this._domAgreeButton.hide();

        this._domAgreeSafetyCheckBox.prop('checked', false);
        this._domAgreeSafetyCheckBox.change();
        this._showSaveStartOverButtons(false);
    }

    _save() {
        function save_to_eeprom()
        {
            MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, reboot);
        }

        function reboot()
        {
            GUI.log(i18n.getMessage('configurationEepromSaved'));

            GUI.tab_switch_cleanup(function() {
                MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false);
                reinitialiseConnection(self);
            });
        }

        let buffer = [];
        buffer.push8(this.motorRemapCanvas.readyMotors.length);

        for (let i = 0; i < this._newMotorRemap.length; i++) {
            buffer.push8(this._newMotorRemap[i]);
        }

        MSP.send_message(MSPCodes.MSP_SET_MOTOR_REMAP, buffer);

        save_to_eeprom();
    }

    _getNewMotorRemap()
    {
        this._newMotorRemap = [];

        for (let i = 0; i < this.motorRemapCanvas.readyMotors.length; i++) {
            this._newMotorRemap.push(this._remapMotorIndex(i));
        }
    }

    _remapMotorIndex(motorIndex)
    {
        return MOTOR_REMAP[this.motorRemapCanvas.readyMotors.indexOf(motorIndex)];
    }

    _startOver()
    {
        this._showSaveStartOverButtons(false);
        this.startUserInteraction();
    }

    _showSaveStartOverButtons(show) {
        if (show) {
            this._domStartOverButton.show();
            this._domSaveButton.show();
        } else {
            this._domStartOverButton.hide();
            this._domSaveButton.hide();
        }
    }

    _onAgreeButtonClicked() {
        this._domActionHintBlock.text(i18n.getMessage("motorRemapDialogSelectSpinningMotor"));
        this._domWarningContentBlock.hide();
        this._domMainContentBlock.show();
        this.startUserInteraction();
    }

    _stopUserInteraction() {
        if (this.motorRemapCanvas) {
            this.motorRemapCanvas.pause();
        }
    }

    startUserInteraction() {
        if (this.motorRemapCanvas) {
            this.motorRemapCanvas.startOver();
        } else {
            this.motorRemapCanvas = new MotorRemapCanvas(this._domCanvas,
                this._droneConfiguration,
                (motorIndex) => { // motor click callback
                    this._onMotorClick(motorIndex);
                },
                (motorIndex) => { // motor spin callback
                    let indexToSpin = -1;

                    if (-1 !== motorIndex) {
                        indexToSpin = this.motorRemapCanvas.readyMotors.indexOf(motorIndex);
                    }

                    this._spinMotor(indexToSpin);
                },
            );
        }

        this._startMotorJerking(0);
    }

    _stopAnyMotorJerking() {
        if (-1 !== this._currentJerkingTimeout) {
            clearTimeout(this._currentJerkingTimeout);
            this._currentJerkingTimeout = -1;
            this._spinMotor(-1);
        }

        this._currentJerkingMotor = -1;
    }

    _startMotorJerking(motorIndex) {
        this._stopAnyMotorJerking();
        this._currentJerkingMotor = motorIndex;
        this._motorStartTimeout(motorIndex);
    }

    _motorStartTimeout(motorIndex) {
        this._spinMotor(motorIndex);
        this._currentJerkingTimeout = setTimeout(() => {
            this._motorStopTimeout(motorIndex);
        }, 250);
    }

    _motorStopTimeout(motorIndex) {
        this._spinMotor(-1);
        this._currentJerkingTimeout = setTimeout(() => {
            this._motorStartTimeout(motorIndex);
        }, 500);
    }


    _spinMotor(motorIndex) {
        this._currentSpinningMotor = motorIndex;
        let buffer = [];

        for (let  i = 0; i < this._config[this._droneConfiguration].Motors.length; i++) {
            if (i === motorIndex) {
                buffer.push16(this._motorSpinValue);
            } else {
                buffer.push16(this._motorStopValue);
            }
        }

        MSP.send_message(MSPCodes.MSP_SET_MOTOR, buffer);
    }

    _stopMotor()
    {
        if (-1 !== this._currentSpinningMotor) {
            this._spinMotor(-1);
        }
    }

    _onMotorClick(motorIndex) {
        console.log(motorIndex);
        this.motorRemapCanvas.readyMotors.push(motorIndex);
        this._currentJerkingMotor ++;

        if (this._currentJerkingMotor < this._config[this._droneConfiguration].Motors.length) {
            this._startMotorJerking(this._currentJerkingMotor);
        } else {
            this._stopAnyMotorJerking();
            this._domActionHintBlock.text(i18n.getMessage("motorRemapDialogRemapIsDone"));
            this._getNewMotorRemap();
            this.motorRemapCanvas.remappingReady = true;
            this._showSaveStartOverButtons(true);
        }
    }
}
