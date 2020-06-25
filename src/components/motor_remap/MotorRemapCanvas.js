'use strict';

function MotorRemapCanvas(canvas)
{
    this.canvas = canvas;
    var width = this.canvas.width();
    var height = this.canvas.height();
    this.screenSize = Math.min(width, height);

    this.config = new MotorRemapConfig(this.screenSize);
    console.log(width, height);
    console.log(this.canvas[0].clientWidth, this.canvas[0].clientHeight);

    canvas[0].width = canvas[0].height *
    (canvas[0].clientWidth / canvas[0].clientHeight);

    canvas.prop({
        width: width,
        height: height
    });

    var droneConfiguration = "Quad X";

    var ctx = this.canvas[0].getContext("2d");
    ctx.canvas.width = width;
    ctx.canvas.heigh = height;
    ctx.translate(width / 2, height / 2);

    ctx.beginPath();
    ctx.lineWidth = this.config[droneConfiguration].ArmWidth;
    ctx.lineCap = "round";
    ctx.strokeStyle = this.config.FrameColor;
    var motors = this.config[droneConfiguration].Motors;
    ctx.moveTo(motors[0].x, motors[0].y);
    ctx.lineTo(motors[3].x, motors[3].y);
    ctx.moveTo(motors[1].x, motors[1].y);
    ctx.lineTo(motors[2].x, motors[2].y);
    //ctx.arc(0, 0, 100, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.lineWidth = this.config.PropEdgeLineWidth;
    ctx.strokeStyle = this.config.PropEdgeColor;

    for (let i = 0; i < motors.length; i++){
        ctx.beginPath();
        ctx.arc(motors[i].x, motors[i].y, this.config[droneConfiguration].PropRadius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.font = this.config.MotorNumberTextFont;
        ctx.fillStyle = this.config.MotorNumberTextColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(i + 1, motors[i].x, motors[i].y);
    }

    ctx.beginPath();
    ctx.moveTo(this.config.DirectionArrowPoints[0].x, this.config.DirectionArrowPoints[0].y);
    for (let i = 1; i < this.config.DirectionArrowPoints.length; i++){
        ctx.lineTo(this.config.DirectionArrowPoints[i].x, this.config.DirectionArrowPoints[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = this.config.ArrowColor;
    ctx.fill();

}
