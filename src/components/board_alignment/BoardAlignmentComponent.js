'use strict';

class BoardAlignmentComponent
{
    constructor(contentDiv, onLoadedCallback)
    {
        this._contentDiv = contentDiv;
        this._onLoadedCallback = onLoadedCallback;

        this._contentDiv.load("./components/board_alignment/body.html", () =>
        {
            this._setupGui();
        });
    }

    _setupGui()
    {
        i18n.localizePage();
        this._readDom();

        this._domNextButton.click(() =>
        {
            this._nextButtonCLick();
        });

        this._onLoadedCallback();
    }

    _readDom()
    {
        this._domNextButton = $("#boardAlignmentComponentNextBtn");
    }

    _nextButtonCLick()
    {
        MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, () =>
        {
            this._imuDataReceived();
        });
    }

    _imuDataReceived()
    {
        let v3 = new THREE.Vector3(0, 0, 1);
        let v1 = new THREE.Vector3(-SENSOR_DATA.accelerometer[0], SENSOR_DATA.accelerometer[1], SENSOR_DATA.accelerometer[2]);
        let v2 = new THREE.Vector3();
        v2.crossVectors(v3, v1);
        console.log("===================================")
        console.log(v1);
        console.log(v2);
        console.log(v3);

        let m = new THREE.Matrix4();
        m.set(
            v1.x, v1.y, v1.z, 0,
            v2.x, v2.y, v2.z, 0,
            v3.x, v3.y, v3.z, 0,
            0,    0,    0,    1,
        );

        var angles = new THREE.Euler(0, 0, 0, 'YXZ');
        angles.setFromRotationMatrix(m, 'XYZ');
        //console.log(angles);
        this._domNextButton.text(`roll = ${angles.x/Math.PI * 180}, pitch = ${angles.y/Math.PI * 180}, yaw = ${angles.z/Math.PI * 180}`);
    }
}
