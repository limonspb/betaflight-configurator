'use strict';

function MotorRemapConfig(screenSize){
    this.FrameColor    = 'rgb(186, 186, 186)';
    this.PropEdgeColor = 'rgb(255, 187, 0)';
    this.PropEdgeLineWidth = 3;
    this.MotorNumberTextFont = screenSize * 0.1 + "px 'Open Sans', 'Segoe UI', Tahoma, sans-serif";
    this.MotorNumberTextColor = 'rgb(0, 0, 0)';
    this.MotorMouseHoverColor = 'rgba(255, 187, 0, 0.4)';
    this.MotorReadyColor = 'rgba(0,128,0,0.4)';

    this.ArrowColor = 'rgb(182,67,67)';
    this.DirectionArrowPoints = [
        {x: -0.02 * screenSize, y:  0.07 * screenSize},
        {x: -0.02 * screenSize, y: -0.03 * screenSize},
        {x: -0.04 * screenSize, y: -0.03 * screenSize},
        {x: -0.0 * screenSize,  y: -0.10 * screenSize},
        {x:  0.04 * screenSize, y: -0.03 * screenSize},
        {x:  0.02 * screenSize, y: -0.03 * screenSize},
        {x:  0.02 * screenSize, y:  0.07 * screenSize},
    ];

    var FrameRaduis = 0.28 * screenSize;
    this["Quad X"] =
    {
        FrameRaduis: FrameRaduis,
        PropRadius: 0.2 * screenSize,
        ArmWidth: 0.1 * screenSize,
        Motors:
        [
            {x:  FrameRaduis,  y:  FrameRaduis},
            {x:  FrameRaduis,  y: -FrameRaduis},
            {x: -FrameRaduis,  y:  FrameRaduis},
            {x: -FrameRaduis,  y: -FrameRaduis},
        ]
    };
};