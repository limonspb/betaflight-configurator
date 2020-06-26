'use strict';

class MotorRemapComponent
{
    constructor(contentDiv, onLoadedCallback, droneConfiguration, motorStopValue, motorSpinValue) {
        this.contentDiv = contentDiv;
        this.onLoadedCallback = onLoadedCallback;
        this.droneConfiguration = droneConfiguration;
        this.motorStopValue = motorStopValue;
        this.motorSpinValue = motorSpinValue;
        this.config = new MotorRemapConfig(100);

        this.currentJerkingTimeout = -1;

        this.contentDiv.load("./components/motor_remap/body.html", ()=>{this.setupdialog();});
    }

    setupdialog() {
        i18n.localizePage();
        $('#dialogMotorRemapMain').hide();
        $('#dialogMotorRemapWarning').show();
        $('#dialogMotorRemapAgreeButton').hide();

        $('#motorsEnableTestMode-dialogMotorRemap').prop('checked', false);

        $('#motorsEnableTestMode-dialogMotorRemap').change(function () {
            var enabled = $(this).is(':checked');

            if (enabled) {
                $('#dialogMotorRemapAgreeButton').show();
            }
            else{
                $('#dialogMotorRemapAgreeButton').hide();
            }
        });

        $('#dialogMotorRemapAgreeButton').click(()=>{this.agreeButtonClicked()});

        //$('#dialogMotorRemapAgreeButton').click();//TODO: REMOVE AFTER TESTING
        this.onLoadedCallback();
    }

    clear() {
        this.contentDiv.empty();
    }

    close() {
        mspHelper.setArmingEnabled(true, true);
    }

    agreeButtonClicked() {
        $('#dialogMotorRemapWarning').hide();
        $('#dialogMotorRemapMain').show();
        //mspHelper.setArmingEnabled(true, true);
        this.startUserInteraction();
    }

    startUserInteraction() {
        this.motorRemapCanvas = new MotorRemapCanvas($('#motorRemapCanvas'), this.droneConfiguration, (motorIndex)=>{this.onMotorClick(motorIndex);});

        //this.spinMotor(1);
        this.startMotorJerking(0);
    }

    startMotorJerking(motorIndex) {
        if (this.currentJerkingTimeout != -1) {
            clearTimeout(this.currentJerkingTimeout);
            this.currentJerkingTimeout = -1;
            spinMotor(-1);
        }

        this.motorStartTimeout(motorIndex);
    }

    motorStartTimeout(motorIndex)
    {
        this.spinMotor(motorIndex);
        this.currentJerkingTimeout = setTimeout(()=>{ this.motorStopTimeout(motorIndex); }, 250);
    }

    motorStopTimeout(motorIndex)
    {
        this.spinMotor(-1);
        this.currentJerkingTimeout = setTimeout(()=>{ this.motorStartTimeout(motorIndex); }, 500);
    }


    spinMotor(motorIndex) {
        var buffer = [];

        for (let  i = 0; i < this.config[this.droneConfiguration].Motors.length; i++)
        {
            if (i == motorIndex) {
                buffer.push16(this.motorSpinValue);
            }
            else {
                buffer.push16(this.motorStopValue);
            }
        }

        //MOTOR_CONFIG.motor_count
        console.log(buffer);
        MSP.send_message(MSPCodes.MSP_SET_MOTOR, buffer);

    }

    onMotorClick(motorIndex) {
        console.log(motorIndex);
    }
}




        /*
        this.apply = function()
        {
            function save_to_eeprom() {
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, reboot);
            }

            function reboot() {
                GUI.log(i18n.getMessage('configurationEepromSaved'));

                GUI.tab_switch_cleanup(function() {
                    MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false);
                    reinitialiseConnection(self);
                });
            }

            var buffer = [];

            buffer.push8(4);
            buffer.push8(7);
            buffer.push8(6);
            buffer.push8(5);
            buffer.push8(4);

            MSP.send_message(MSPCodes.MSP_SET_MOTOR_REMAP, buffer);

            save_to_eeprom();
        }
        */
