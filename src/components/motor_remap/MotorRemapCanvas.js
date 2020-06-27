'use strict';

class MotorRemapCanvas {
    constructor(canvas, droneConfiguration, motorClickCallback, spinMotorCallback) {
        this.spinMotorCallback = spinMotorCallback;
        this.canvas = canvas;
        this.motorClickCallback = motorClickCallback;
        this.width = this.canvas.width();
        this.height = this.canvas.height();
        this.screenSize = Math.min(this.width, this.height);

        this.config = new MotorRemapConfig(this.screenSize);

        canvas[0].width = canvas[0].height *
        (canvas[0].clientWidth / canvas[0].clientHeight);

        canvas.prop({
            width: this.width,
            height: this.height
        });

        this.droneConfiguration = droneConfiguration;

        this.ctx = this.canvas[0].getContext("2d");
        this.ctx.canvas.width = this.width;
        this.ctx.canvas.heigh = this.height;
        this.ctx.translate(this.width / 2, this.height / 2);

        this.canvas.mousemove((event)=>{this.onMouseMove(event);});
        this.canvas.mouseleave(()=>{this.onMouseLeave(event);});
        this.canvas.mousedown(()=>{this.onMouseDown(event);});
        this.canvas.mouseup(()=>{this.onMouseUp(event);});
        this.canvas.click(()=>{this.onMouseClick();});

        this.startOver();
    }

    pause() {
        this.keepDrawing = false;
    }

    startOver()
    {
        this.readyMotors = []; //motors that already being selected
        this.remappingReady = false;
        this.motorIndexToSpinOnMouseDown = -1;
        this.keepDrawing = true;
        this.mouse = {x : 0, y: 0};
        window.requestAnimationFrame(()=>{this.drawOnce()});
    }

    drawOnce() {
        var ctx = this.ctx;
        var droneConfiguration = this.droneConfiguration;
        var config = this.config;

        ctx.clearRect(- this.width / 2,  -this.height / 2, this.width, this.height);

        this.drawFrame();
        this.drawDirectionArrow()
        this.markMotors();
        this.drawMotors();

        if (this.keepDrawing) {
            window.requestAnimationFrame(()=>{this.drawOnce()});
        }
    }

    onMouseDown()
    {
        if (this.remappingReady)
        {
            var mouseHoverMotorIndex = this.getMouseHoverMotorIndex();
            this.motorIndexToSpinOnMouseDown = mouseHoverMotorIndex;
            if (this.spinMotorCallback) {
                this.spinMotorCallback(this.motorIndexToSpinOnMouseDown);
            }
        }
    }

    onMouseUp()
    {
        if (-1 != this.motorIndexToSpinOnMouseDown) {

            this.motorIndexToSpinOnMouseDown = -1;

            if (this.spinMotorCallback) {
                this.spinMotorCallback(this.motorIndexToSpinOnMouseDown);
            }
        }
    }

    onMouseClick() {
        var motorIndex = this.getMouseHoverMotorIndex();

        if (this.motorClickCallback && motorIndex != -1 && !this.readyMotors.includes(motorIndex)) {
            this.motorClickCallback(motorIndex);
        }
    }

    onMouseMove(event) {
        var boundingRect = this.canvas[0].getBoundingClientRect();
        this.mouse.x = event.clientX - boundingRect.left - this.width / 2;
        this.mouse.y = event.clientY - boundingRect.top - this.height / 2;
    }

    onMouseLeave() {
        this.mouse.x = Number.MIN_SAFE_INTEGER;
        this.mouse.y = Number.MIN_SAFE_INTEGER;

        if (-1 != this.motorIndexToSpinOnMouseDown) {

            this.motorIndexToSpinOnMouseDown = -1;

            if (this.spinMotorCallback) {
                this.spinMotorCallback(this.motorIndexToSpinOnMouseDown);
            }
        }
    }

    markMotors() {
        var ctx = this.ctx;
        var droneConfiguration = this.droneConfiguration;
        var config = this.config;
        var motors = config[droneConfiguration].Motors;

        if (-1 == this.motorIndexToSpinOnMouseDown)
        {
            for (let i = 0; i < this.readyMotors.length; i++) {
                var motorIndex = this.readyMotors[i];
                ctx.beginPath();
                ctx.arc(motors[motorIndex].x, motors[motorIndex].y, config[droneConfiguration].PropRadius, 0, 2 * Math.PI);
                ctx.closePath();
                ctx.fillStyle = config.MotorReadyColor;
                ctx.fill();
            }

            var mouseHoverMotorIndex = this.getMouseHoverMotorIndex();
            if (mouseHoverMotorIndex != -1 && !this.readyMotors.includes(mouseHoverMotorIndex)) {
                ctx.beginPath();
                ctx.arc(motors[mouseHoverMotorIndex].x, motors[mouseHoverMotorIndex].y, config[droneConfiguration].PropRadius, 0, 2 * Math.PI);
                ctx.closePath();
                ctx.fillStyle = config.MotorMouseHoverColor;
                ctx.fill();
            }
        } else {
            var mouseHoverMotorIndex = this.getMouseHoverMotorIndex();
            var spinningMotor = this.motorIndexToSpinOnMouseDown;

            var motors = config[droneConfiguration].Motors;

            for (let i = 0; i < motors.length; i++) {
                ctx.fillStyle = config.MotorReadyColor;
                if (i == spinningMotor)
                {
                    ctx.fillStyle = config.MotorSpinningColor;
                } else if (i == mouseHoverMotorIndex) {
                    ctx.fillStyle = config.MotorMouseHoverColor;
                }

                ctx.beginPath();
                ctx.arc(motors[i].x, motors[i].y, config[droneConfiguration].PropRadius, 0, 2 * Math.PI);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    getMouseHoverMotorIndex() {
        var x = this.mouse.x;
        var y = this.mouse.y;

        var result = -1;
        var currentDist = Number.MAX_SAFE_INTEGER;
        var droneConfiguration = this.droneConfiguration;
        var motors = this.config[droneConfiguration].Motors;

        for (let i = 0; i < motors.length; i++) {
            var dist = Math.sqrt((x - motors[i].x) * (x - motors[i].x) + (y - motors[i].y) * (y - motors[i].y));
            if (dist < this.config[droneConfiguration].PropRadius && dist < currentDist) {
                currentDist = dist;
                result = i;
            }
        }

        return result;
    }

    drawMotors() {
        var ctx = this.ctx;
        var droneConfiguration = this.droneConfiguration;
        var config = this.config;

        ctx.lineWidth = config.PropEdgeLineWidth;
        ctx.strokeStyle = config.PropEdgeColor;
        var motors = config[droneConfiguration].Motors;

        for (let i = 0; i < motors.length; i++) {
            ctx.beginPath();
            ctx.arc(motors[i].x, motors[i].y, config[droneConfiguration].PropRadius, 0, 2 * Math.PI);
            ctx.stroke();

            ctx.font = config.MotorNumberTextFont;
            ctx.fillStyle = config.MotorNumberTextColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(i + 1, motors[i].x, motors[i].y);

        }
    }

    drawDirectionArrow() {
        var ctx = this.ctx;
        var droneConfiguration = this.droneConfiguration;
        var config = this.config;

        ctx.beginPath();
        ctx.moveTo(config.DirectionArrowPoints[0].x, config.DirectionArrowPoints[0].y);
        for (let i = 1; i < config.DirectionArrowPoints.length; i++) {
            ctx.lineTo(config.DirectionArrowPoints[i].x, config.DirectionArrowPoints[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = config.ArrowColor;
        ctx.fill();
    }

    drawFrame() {
        var ctx = this.ctx;
        var droneConfiguration = this.droneConfiguration;
        var config = this.config;

        ctx.beginPath();
        ctx.lineWidth = config[droneConfiguration].ArmWidth;
        ctx.lineCap = "round";
        ctx.strokeStyle = config.FrameColor;
        var motors = config[droneConfiguration].Motors;

        switch(this.droneConfiguration) {
            case "Quad X":
            case "Quad +":
                ctx.moveTo(motors[0].x, motors[0].y);
                ctx.lineTo(motors[3].x, motors[3].y);
                ctx.moveTo(motors[1].x, motors[1].y);
                ctx.lineTo(motors[2].x, motors[2].y);
                break;
            case "Quad X 1234":
                ctx.moveTo(motors[0].x, motors[0].y);
                ctx.lineTo(motors[2].x, motors[2].y);
                ctx.moveTo(motors[3].x, motors[3].y);
                ctx.lineTo(motors[1].x, motors[1].y);
                break;
            case "Tricopter":
                ctx.moveTo(motors[1].x, motors[1].y);
                ctx.lineTo(motors[2].x, motors[2].y);
                ctx.moveTo(motors[0].x, motors[0].y);
                ctx.lineTo(motors[0].x, motors[2].y);
                break;
            case "Hex +":
            case "Hex X":
                ctx.moveTo(motors[0].x, motors[0].y);
                ctx.lineTo(motors[3].x, motors[3].y);
                ctx.moveTo(motors[1].x, motors[1].y);
                ctx.lineTo(motors[2].x, motors[2].y);
                ctx.moveTo(motors[4].x, motors[4].y);
                ctx.lineTo(motors[5].x, motors[5].y);
                break;
        }
        ctx.stroke();
    }
}
