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

        this._contentDiv.load("./components/motor_remap/body.html", ()=>{ this._setupdialog(); });
    }

    _setupdialog()
    {
        i18n.localizePage();

        this._resetGui();

        $('#motorsEnableTestMode-dialogMotorRemap').change(function ()
        {
            var enabled = $(this).is(':checked');

            if (enabled) {
                $('#dialogMotorRemapAgreeButton').show();
            } else {
                $('#dialogMotorRemapAgreeButton').hide();
            }
        });

        $('#dialogMotorRemapAgreeButton').click(()=>{ this._onAgreeButtonClicked(); });
        $("#motorsRemapDialogStartOver").click(()=>{ this._startOver(); });
        $("#motorsRemapDialogSave").click(()=>{ this._save(); });

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
        $('#dialogMotorRemapMainContent').hide();
        $('#dialogMotorRemapWarning').show();
        $('#dialogMotorRemapAgreeButton').hide();

        $('#motorsEnableTestMode-dialogMotorRemap').prop('checked', false);
        $('#motorsEnableTestMode-dialogMotorRemap').change();
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

        var buffer = [];
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
            $("#motorsRemapDialogStartOver").show();
            $("#motorsRemapDialogSave").show();
        } else {
            $("#motorsRemapDialogStartOver").hide();
            $("#motorsRemapDialogSave").hide();
        }
    }

    _onAgreeButtonClicked() {
        $('#motorRemapActionHint').text(i18n.getMessage("motorRemapDialogSelectSpinningMotor"));
        $('#dialogMotorRemapWarning').hide();
        $('#dialogMotorRemapMainContent').show();
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
            this.motorRemapCanvas = new MotorRemapCanvas($('#motorRemapCanvas'),
                this._droneConfiguration,
                (motorIndex)=>{this._onMotorClick(motorIndex);},
                (motorIndex)=>{
                    if (-1 == motorIndex) {
                        this._spinMotor(motorIndex);
                    } else {
                        let indexToSpin = this.motorRemapCanvas.readyMotors.indexOf(motorIndex);
                        this._spinMotor(indexToSpin);
                    }
            });
        }

        this._startMotorJerking(0);
    }

    _stopAnyMotorJerking() {
        if (this._currentJerkingTimeout != -1) {
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
        this._currentJerkingTimeout = setTimeout(()=>{ this._motorStopTimeout(motorIndex); }, 250);
    }

    _motorStopTimeout(motorIndex) {
        this._spinMotor(-1);
        this._currentJerkingTimeout = setTimeout(()=>{ this._motorStartTimeout(motorIndex); }, 500);
    }


    _spinMotor(motorIndex) {
        this._currentSpinningMotor = motorIndex;
        var buffer = [];

        for (let  i = 0; i < this._config[this._droneConfiguration].Motors.length; i++) {
            if (i == motorIndex) {
                buffer.push16(this._motorSpinValue);
            } else {
                buffer.push16(this._motorStopValue);
            }
        }

        MSP.send_message(MSPCodes.MSP_SET_MOTOR, buffer);
    }

    _stopMotor()
    {
        if (-1 != this._currentSpinningMotor) {
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
            $('#motorRemapActionHint').text(i18n.getMessage("motorRemapDialogRemapIsDone"));
            this._getNewMotorRemap();
            this.motorRemapCanvas.remappingReady = true;
            this._showSaveStartOverButtons(true);
        }
    }
}
