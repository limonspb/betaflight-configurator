'use strict';

class MotorRemapCanvas
{
    constructor(canvas, droneConfiguration, motorClickCallback, spinMotorCallback)
    {
        this._spinMotorCallback = spinMotorCallback;
        this._canvas = canvas;
        this._motorClickCallback = motorClickCallback;
        this._width = this._canvas.width();
        this._height = this._canvas.height();
        this._screenSize = Math.min(this._width, this._height);

        this._config = new MotorRemapConfig(this._screenSize);

        // no component resize allowing yet
        this._canvas.prop({
            width: this._width,
            height: this._height
        });

        this._droneConfiguration = droneConfiguration;

        this._ctx = this._canvas[0].getContext("2d");
        this._ctx.translate(this._width / 2, this._height / 2);

        this._canvas.mousemove((event)=>{ this._onMouseMove(event); });
        this._canvas.mouseleave(()=>{ this._onMouseLeave(event); });
        this._canvas.mousedown(()=>{ this._onMouseDown(event); });
        this._canvas.mouseup(()=>{ this._onMouseUp(event); });
        this._canvas.click(()=>{ this._onMouseClick(); });

        this.startOver();
    }

    pause()
    {
        this._keepDrawing = false;
    }

    startOver()
    {
        this.readyMotors = []; //motors that already being selected for remapping by user
        this.remappingReady = false;
        this._motorIndexToSpinOnMouseDown = -1;
        this._keepDrawing = true;
        this._mouse = {x : 0, y: 0};
        window.requestAnimationFrame(()=>{ this._drawOnce(); });
    }

    _drawOnce()
    {
        this._ctx.clearRect(- this._width / 2,  -this._height / 2, this._width, this._height);

        this._drawFrame();
        this._drawDirectionArrow()
        this._markMotors();
        this._drawMotors();

        if (this._keepDrawing) {
            window.requestAnimationFrame(()=>{this._drawOnce()});
        }
    }

    _onMouseDown()
    {
        if (this.remappingReady) {
            var mouseHoverMotorIndex = this._getMouseHoverMotorIndex();
            this._motorIndexToSpinOnMouseDown = mouseHoverMotorIndex;
            if (this._spinMotorCallback) {
                this._spinMotorCallback(this._motorIndexToSpinOnMouseDown);
            }
        }
    }

    _onMouseUp()
    {
        if (-1 != this._motorIndexToSpinOnMouseDown) {

            this._motorIndexToSpinOnMouseDown = -1;

            if (this._spinMotorCallback) {
                this._spinMotorCallback(this._motorIndexToSpinOnMouseDown);
            }
        }
    }

    _onMouseClick()
    {
        var motorIndex = this._getMouseHoverMotorIndex();

        if (this._motorClickCallback && motorIndex != -1 && !this.readyMotors.includes(motorIndex)) {
            this._motorClickCallback(motorIndex);
        }
    }

    _onMouseMove(event)
    {
        var boundingRect = this._canvas[0].getBoundingClientRect();
        this._mouse.x = event.clientX - boundingRect.left - this._width / 2;
        this._mouse.y = event.clientY - boundingRect.top - this._height / 2;
    }

    _onMouseLeave()
    {
        this._mouse.x = Number.MIN_SAFE_INTEGER;
        this._mouse.y = Number.MIN_SAFE_INTEGER;

        if (-1 != this._motorIndexToSpinOnMouseDown) {
            this._motorIndexToSpinOnMouseDown = -1;

            if (this._spinMotorCallback) {
                this._spinMotorCallback(this._motorIndexToSpinOnMouseDown);
            }
        }
    }

    _markMotors()
    {
        var ctx = this._ctx;
        var droneConfiguration = this._droneConfiguration;
        var config = this._config;
        var motors = config[droneConfiguration].Motors;

        if (-1 == this._motorIndexToSpinOnMouseDown) {
            for (let i = 0; i < this.readyMotors.length; i++) {
                var motorIndex = this.readyMotors[i];
                ctx.beginPath();
                ctx.arc(motors[motorIndex].x, motors[motorIndex].y, config[droneConfiguration].PropRadius, 0, 2 * Math.PI);
                ctx.closePath();
                ctx.fillStyle = config.MotorReadyColor;
                ctx.fill();
            }

            var mouseHoverMotorIndex = this._getMouseHoverMotorIndex();
            if (mouseHoverMotorIndex != -1 && !this.readyMotors.includes(mouseHoverMotorIndex)) {
                ctx.beginPath();
                ctx.arc(motors[mouseHoverMotorIndex].x, motors[mouseHoverMotorIndex].y, config[droneConfiguration].PropRadius, 0, 2 * Math.PI);
                ctx.closePath();
                ctx.fillStyle = config.MotorMouseHoverColor;
                ctx.fill();
            }
        } else {
            var mouseHoverMotorIndex = this._getMouseHoverMotorIndex();
            var spinningMotor = this._motorIndexToSpinOnMouseDown;

            var motors = config[droneConfiguration].Motors;

            for (let i = 0; i < motors.length; i++) {
                ctx.fillStyle = config.MotorReadyColor;
                if (i == spinningMotor) {
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

    _getMouseHoverMotorIndex()
    {
        var x = this._mouse.x;
        var y = this._mouse.y;

        var result = -1;
        var currentDist = Number.MAX_SAFE_INTEGER;
        var droneConfiguration = this._droneConfiguration;
        var motors = this._config[droneConfiguration].Motors;

        for (let i = 0; i < motors.length; i++) {
            var dist = Math.sqrt((x - motors[i].x) * (x - motors[i].x) + (y - motors[i].y) * (y - motors[i].y));
            if (dist < this._config[droneConfiguration].PropRadius && dist < currentDist) {
                currentDist = dist;
                result = i;
            }
        }

        return result;
    }

    _drawMotors()
    {
        var ctx = this._ctx;
        var droneConfiguration = this._droneConfiguration;
        var config = this._config;

        ctx.lineWidth = config.PropEdgeLineWidth;
        ctx.strokeStyle = config.PropEdgeColor;
        var motors = config[droneConfiguration].Motors;

        for (let i = 0; i < motors.length; i++) {
            ctx.beginPath();
            ctx.arc(motors[i].x, motors[i].y, config[droneConfiguration].PropRadius, 0, 2 * Math.PI);
            ctx.stroke();

            /*
            // uncomment for checking new configurations motor order
            ctx.font = config.MotorNumberTextFont;
            ctx.fillStyle = config.MotorNumberTextColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(i + 1, motors[i].x, motors[i].y);
            */
        }
    }

    _drawDirectionArrow()
    {
        var ctx = this._ctx;
        var droneConfiguration = this._droneConfiguration;
        var config = this._config;

        ctx.beginPath();
        ctx.moveTo(config.DirectionArrowPoints[0].x, config.DirectionArrowPoints[0].y);
        for (let i = 1; i < config.DirectionArrowPoints.length; i++) {
            ctx.lineTo(config.DirectionArrowPoints[i].x, config.DirectionArrowPoints[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = config.ArrowColor;
        ctx.fill();
    }

    _drawFrame()
    {
        var ctx = this._ctx;
        var droneConfiguration = this._droneConfiguration;
        var config = this._config;

        ctx.beginPath();
        ctx.lineWidth = config[droneConfiguration].ArmWidth;
        ctx.lineCap = "round";
        ctx.strokeStyle = config.FrameColor;
        var motors = config[droneConfiguration].Motors;

        switch(this._droneConfiguration) {
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
