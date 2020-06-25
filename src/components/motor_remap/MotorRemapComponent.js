'use strict';

class MotorRemapComponent
{
    constructor(contentDiv, onLoadedCallback)
    {
        this.contentDiv = contentDiv;
        this.onLoadedCallback = onLoadedCallback;

        this.contentDiv.load("./components/motor_remap/body.html", ()=>{this.setupdialog();});
    }

    setupdialog()
    {
        i18n.localizePage();
        $('#dialogMotorRemapMain').hide();
        $('#dialogMotorRemapWarning').show();
        $('#dialogMotorRemapAgreeButton').hide();

        $('#motorsEnableTestMode-dialogMotorRemap').change(function () {
            var enabled = $(this).is(':checked');

            if (enabled) {
                $('#dialogMotorRemapAgreeButton').show();
            }
            else{
                $('#dialogMotorRemapAgreeButton').hide();
            }

            mspHelper.setArmingEnabled(enabled, enabled);
        }).change();

        $('#dialogMotorRemapAgreeButton').click(()=>{this.agreeButtonClicked()});

        //$('#dialogMotorRemapAgreeButton').click();//TODO: REMOVE AFTER TESTING
        this.onLoadedCallback();
    }

    clear()
    {
        this.contentDiv.empty();
    }

    close()
    {
        mspHelper.setArmingEnabled(true, true);
    }

    agreeButtonClicked()
    {
        $('#dialogMotorRemapWarning').hide();
        $('#dialogMotorRemapMain').show();
        mspHelper.setArmingEnabled(true, true);
        this.startUserInteraction();
    }

    startUserInteraction(){
        this.motorRemapCanvas = new MotorRemapCanvas($('#motorRemapCanvas'));
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
