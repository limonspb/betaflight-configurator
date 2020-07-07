'use strict';

function MspHelper () {
  var self = this;

  // 0 based index, must be identical to 'baudRates' in 'src/main/io/serial.c' in betaflight
  self.BAUD_RATES = ['AUTO', '9600', '19200', '38400', '57600', '115200',
    '230400', '250000', '400000', '460800', '500000', '921600', '1000000',
    '1500000', '2000000', '2470000'];
  // needs to be identical to 'serialPortFunction_e' in 'src/main/io/serial.h' in betaflight
  self.SERIAL_PORT_FUNCTIONS = {
    'MSP': 0,
    'GPS': 1,
    'TELEMETRY_FRSKY': 2,
    'TELEMETRY_HOTT': 3,
    'TELEMETRY_MSP': 4,
    'TELEMETRY_LTM': 4, // LTM replaced MSP
    'TELEMETRY_SMARTPORT': 5,
    'RX_SERIAL': 6,
    'BLACKBOX': 7,
    'TELEMETRY_MAVLINK': 9,
    'ESC_SENSOR': 10,
    'TBS_SMARTAUDIO': 11,
    'TELEMETRY_IBUS': 12,
    'IRC_TRAMP': 13,
    'RUNCAM_DEVICE_CONTROL': 14, // support communitate with RunCam Device
    'LIDAR_TF': 15,
    'FRSKY_OSD': 16,
  };

    self.REBOOT_TYPES = {
        FIRMWARE: 0,
        BOOTLOADER: 1,
        MSC: 2,
        MSC_UTC: 3
    };

    self.RESET_TYPES = {
        BASE_DEFAULTS: 0,
        CUSTOM_DEFAULTS: 1,
    };

    self.SIGNATURE_LENGTH = 32;

    self.mspMultipleCache = [];
}

MspHelper.prototype.reorderPwmProtocols = function (protocol) {
    var result = protocol;
    if (semver.lt(FC.CONFIG.apiVersion, "1.26.0")) {
        switch (protocol) {
            case 5:
                result = 7;

                break;
            case 7:
                result = 5;

                break;
            default:
                break;
        }
    }

    return result;
}

MspHelper.prototype.process_data = function(dataHandler) {
    var self = this;

    var data = dataHandler.dataView; // DataView (allowing us to view arrayBuffer as struct/union)
    var code = dataHandler.code;
    var crcError = dataHandler.crcError;
    if (!crcError) {
        if (!dataHandler.unsupported) switch (code) {
            case MSPCodes.MSP_STATUS:
                FC.CONFIG.cycleTime = data.readU16();
                FC.CONFIG.i2cError = data.readU16();
                FC.CONFIG.activeSensors = data.readU16();
                FC.CONFIG.mode = data.readU32();
                FC.CONFIG.profile = data.readU8();

                TABS.pid_tuning.checkUpdateProfile(false);

                sensor_status(FC.CONFIG.activeSensors);
                $('span.i2c-error').text(FC.CONFIG.i2cError);
                $('span.cycle-time').text(FC.CONFIG.cycleTime);
                break;
            case MSPCodes.MSP_STATUS_EX:
                FC.CONFIG.cycleTime = data.readU16();
                FC.CONFIG.i2cError = data.readU16();
                FC.CONFIG.activeSensors = data.readU16();
                FC.CONFIG.mode = data.readU32();
                FC.CONFIG.profile = data.readU8();
                FC.CONFIG.cpuload = data.readU16();
                if (semver.gte(FC.CONFIG.apiVersion, "1.16.0")) {
                    FC.CONFIG.numProfiles = data.readU8();
                    FC.CONFIG.rateProfile = data.readU8();

                    if (semver.gte(FC.CONFIG.apiVersion, "1.36.0")) {
                      // Read flight mode flags
                      var byteCount = data.readU8();
                      for (let i = 0; i < byteCount; i++) {
                        data.readU8();
                      }

                      // Read arming disable flags
                      FC.CONFIG.armingDisableCount = data.readU8(); // Flag count
                      FC.CONFIG.armingDisableFlags = data.readU32();
                    }

                    TABS.pid_tuning.checkUpdateProfile(true);
                }

                sensor_status(FC.CONFIG.activeSensors);
                $('span.i2c-error').text(FC.CONFIG.i2cError);
                $('span.cycle-time').text(FC.CONFIG.cycleTime);
                $('span.cpu-load').text(i18n.getMessage('statusbar_cpu_load', [FC.CONFIG.cpuload]));
                break;

            case MSPCodes.MSP_RAW_IMU:
                // 512 for mpu6050, 256 for mma
                // currently we are unable to differentiate between the sensor types, so we are goign with 512
                FC.SENSOR_DATA.accelerometer[0] = data.read16() / 512;
                FC.SENSOR_DATA.accelerometer[1] = data.read16() / 512;
                FC.SENSOR_DATA.accelerometer[2] = data.read16() / 512;

                // properly scaled
                FC.SENSOR_DATA.gyroscope[0] = data.read16() * (4 / 16.4);
                FC.SENSOR_DATA.gyroscope[1] = data.read16() * (4 / 16.4);
                FC.SENSOR_DATA.gyroscope[2] = data.read16() * (4 / 16.4);

                // no clue about scaling factor
                FC.SENSOR_DATA.magnetometer[0] = data.read16() / 1090;
                FC.SENSOR_DATA.magnetometer[1] = data.read16() / 1090;
                FC.SENSOR_DATA.magnetometer[2] = data.read16() / 1090;
                break;
            case MSPCodes.MSP_SERVO:
                var servoCount = data.byteLength / 2;
                for (let i = 0; i < servoCount; i++) {
                    FC.SERVO_DATA[i] = data.readU16();
                }
                break;
            case MSPCodes.MSP_MOTOR:
                var motorCount = data.byteLength / 2;
                for (let i = 0; i < motorCount; i++) {
                    FC.MOTOR_DATA[i] = data.readU16();
                }
                break;
            case MSPCodes.MSP_MOTOR_OUTPUT_REORDERING:
                FC.MOTOR_OUTPUT_ORDER = [];
                const arraySize = data.read8();
                for (let i = 0; i < arraySize; i++) {
                    FC.MOTOR_OUTPUT_ORDER[i] = data.readU8();
                }
                break;
            case MSPCodes.MSP_MOTOR_TELEMETRY:
                var telemMotorCount = data.readU8();
                for (let i = 0; i < telemMotorCount; i++) {
                    FC.MOTOR_TELEMETRY_DATA.rpm[i] = data.readU32();   // RPM
                    FC.MOTOR_TELEMETRY_DATA.invalidPercent[i] = data.readU16();   // 10000 = 100.00%
                    FC.MOTOR_TELEMETRY_DATA.temperature[i] = data.readU8();       // degrees celsius
                    FC.MOTOR_TELEMETRY_DATA.voltage[i] = data.readU16();          // 0.01V per unit
                    FC.MOTOR_TELEMETRY_DATA.current[i] = data.readU16();          // 0.01A per unit
                    FC.MOTOR_TELEMETRY_DATA.consumption[i] = data.readU16();      // mAh
                }
                break;
            case MSPCodes.MSP_RC:
                FC.RC.active_channels = data.byteLength / 2;
                for (let i = 0; i < FC.RC.active_channels; i++) {
                    FC.RC.channels[i] = data.readU16();
                }
                break;
            case MSPCodes.MSP_RAW_GPS:
                FC.GPS_DATA.fix = data.readU8();
                FC.GPS_DATA.numSat = data.readU8();
                FC.GPS_DATA.lat = data.read32();
                FC.GPS_DATA.lon = data.read32();
                FC.GPS_DATA.alt = data.readU16();
                FC.GPS_DATA.speed = data.readU16();
                FC.GPS_DATA.ground_course = data.readU16();
                break;
            case MSPCodes.MSP_COMP_GPS:
                FC.GPS_DATA.distanceToHome = data.readU16();
                FC.GPS_DATA.directionToHome = data.readU16();
                FC.GPS_DATA.update = data.readU8();
                break;
            case MSPCodes.MSP_ATTITUDE:
                FC.SENSOR_DATA.kinematics[0] = data.read16() / 10.0; // x
                FC.SENSOR_DATA.kinematics[1] = data.read16() / 10.0; // y
                FC.SENSOR_DATA.kinematics[2] = data.read16(); // z
                break;
            case MSPCodes.MSP_ALTITUDE:
                FC.SENSOR_DATA.altitude = parseFloat((data.read32() / 100.0).toFixed(2)); // correct scale factor
                break;
            case MSPCodes.MSP_SONAR:
                FC.SENSOR_DATA.sonar = data.read32();
                break;
            case MSPCodes.MSP_ANALOG:
                FC.ANALOG.voltage = data.readU8() / 10.0;
                FC.ANALOG.mAhdrawn = data.readU16();
                FC.ANALOG.rssi = data.readU16(); // 0-1023
                FC.ANALOG.amperage = data.read16() / 100; // A
                FC.ANALOG.last_received_timestamp = Date.now();
                if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                    FC.ANALOG.voltage = data.readU16() / 100;
                }
                break;
            case MSPCodes.MSP_VOLTAGE_METERS:
                FC.VOLTAGE_METERS = [];
                var voltageMeterLength = 2;
                for (let i = 0; i < (data.byteLength / voltageMeterLength); i++) {
                    var voltageMeter = {};
                    voltageMeter.id = data.readU8();
                    voltageMeter.voltage = data.readU8() / 10.0;

                    FC.VOLTAGE_METERS.push(voltageMeter)
                }
                break;
            case MSPCodes.MSP_CURRENT_METERS:

                FC.CURRENT_METERS = [];
                var currentMeterLength = 5;
                for (let i = 0; i < (data.byteLength / currentMeterLength); i++) {
                    var currentMeter = {};
                    currentMeter.id = data.readU8();
                    currentMeter.mAhDrawn = data.readU16(); // mAh
                    currentMeter.amperage = data.readU16() / 1000; // A

                    FC.CURRENT_METERS.push(currentMeter);
                }
                break;
            case MSPCodes.MSP_BATTERY_STATE:
                FC.BATTERY_STATE.cellCount = data.readU8();
                FC.BATTERY_STATE.capacity = data.readU16(); // mAh

                FC.BATTERY_STATE.voltage = data.readU8() / 10.0; // V
                FC.BATTERY_STATE.mAhDrawn = data.readU16(); // mAh
                FC.BATTERY_STATE.amperage = data.readU16() / 100; // A
                if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                    FC.BATTERY_STATE.batteryState = data.readU8();
                    FC.BATTERY_STATE.voltage = data.readU16() / 100;
                }
                break;

            case MSPCodes.MSP_VOLTAGE_METER_CONFIG:
                if (semver.lt(FC.CONFIG.apiVersion, "1.36.0")) {
                    FC.MISC.vbatscale = data.readU8(); // 10-200
                    FC.MISC.vbatmincellvoltage = data.readU8() / 10; // 10-50
                    FC.MISC.vbatmaxcellvoltage = data.readU8() / 10; // 10-50
                    FC.MISC.vbatwarningcellvoltage = data.readU8() / 10; // 10-50
                    if (semver.gte(FC.CONFIG.apiVersion, "1.23.0")) {
                        FC.MISC.batterymetertype = data.readU8();
                    }
                } else {
                    FC.VOLTAGE_METER_CONFIGS = [];
                    var voltage_meter_count = data.readU8();

                    for (let i = 0; i < voltage_meter_count; i++) {
                        var subframe_length = data.readU8();
                        if (subframe_length != 5) {
                            for (var j = 0; j < subframe_length; j++) {
                                data.readU8();
                            }
                        } else {
                            var voltageMeterConfig = {};
                            voltageMeterConfig.id = data.readU8();
                            voltageMeterConfig.sensorType = data.readU8();
                            voltageMeterConfig.vbatscale = data.readU8();
                            voltageMeterConfig.vbatresdivval = data.readU8();
                            voltageMeterConfig.vbatresdivmultiplier = data.readU8();

                            FC.VOLTAGE_METER_CONFIGS.push(voltageMeterConfig);
                        }
                    }
                }
                break;
            case MSPCodes.MSP_CURRENT_METER_CONFIG:
                if (semver.lt(FC.CONFIG.apiVersion, "1.36.0"))  {
                    FC.BF_CONFIG.currentscale = data.read16();
                    FC.BF_CONFIG.currentoffset = data.read16();
                    FC.BF_CONFIG.currentmetertype = data.readU8();
                    FC.BF_CONFIG.batterycapacity = data.readU16();
                } else {
                    var offset = 0;
                    FC.CURRENT_METER_CONFIGS = [];
                    var current_meter_count = data.readU8();
                    for (let i = 0; i < current_meter_count; i++) {
                        var currentMeterConfig = {};
                        var subframe_length = data.readU8();

                        if (subframe_length != 6) {
                            for (var j = 0; j < subframe_length; j++) {
                                data.readU8();
                            }
                        } else {
                            currentMeterConfig.id = data.readU8();
                            currentMeterConfig.sensorType = data.readU8();
                            currentMeterConfig.scale = data.read16();
                            currentMeterConfig.offset = data.read16();

                            FC.CURRENT_METER_CONFIGS.push(currentMeterConfig);
                        }
                    }
                }
                break;

            case MSPCodes.MSP_BATTERY_CONFIG:
                FC.BATTERY_CONFIG.vbatmincellvoltage = data.readU8() / 10; // 10-50
                FC.BATTERY_CONFIG.vbatmaxcellvoltage = data.readU8() / 10; // 10-50
                FC.BATTERY_CONFIG.vbatwarningcellvoltage = data.readU8() / 10; // 10-50
                FC.BATTERY_CONFIG.capacity = data.readU16();
                FC.BATTERY_CONFIG.voltageMeterSource = data.readU8();
                FC.BATTERY_CONFIG.currentMeterSource = data.readU8();
                if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                    FC.BATTERY_CONFIG.vbatmincellvoltage = data.readU16() / 100;
                    FC.BATTERY_CONFIG.vbatmaxcellvoltage = data.readU16() / 100;
                    FC.BATTERY_CONFIG.vbatwarningcellvoltage = data.readU16() / 100;
                }
                break;
            case MSPCodes.MSP_RC_TUNING:
                FC.RC_TUNING.RC_RATE = parseFloat((data.readU8() / 100).toFixed(2));
                FC.RC_TUNING.RC_EXPO = parseFloat((data.readU8() / 100).toFixed(2));
                if (semver.lt(FC.CONFIG.apiVersion, "1.7.0")) {
                    FC.RC_TUNING.roll_pitch_rate = parseFloat((data.readU8() / 100).toFixed(2));
                    FC.RC_TUNING.pitch_rate = 0;
                    FC.RC_TUNING.roll_rate = 0;
                } else {
                    FC.RC_TUNING.roll_pitch_rate = 0;
                    FC.RC_TUNING.roll_rate = parseFloat((data.readU8() / 100).toFixed(2));
                    FC.RC_TUNING.pitch_rate = parseFloat((data.readU8() / 100).toFixed(2));
                }
                FC.RC_TUNING.yaw_rate = parseFloat((data.readU8() / 100).toFixed(2));
                FC.RC_TUNING.dynamic_THR_PID = parseFloat((data.readU8() / 100).toFixed(2));
                FC.RC_TUNING.throttle_MID = parseFloat((data.readU8() / 100).toFixed(2));
                FC.RC_TUNING.throttle_EXPO = parseFloat((data.readU8() / 100).toFixed(2));
                if (semver.gte(FC.CONFIG.apiVersion, "1.7.0")) {
                    FC.RC_TUNING.dynamic_THR_breakpoint = data.readU16();
                } else {
                    FC.RC_TUNING.dynamic_THR_breakpoint = 0;
                }
                if (semver.gte(FC.CONFIG.apiVersion, "1.10.0")) {
                    FC.RC_TUNING.RC_YAW_EXPO = parseFloat((data.readU8() / 100).toFixed(2));
                    if (semver.gte(FC.CONFIG.apiVersion, "1.16.0")) {
                        FC.RC_TUNING.rcYawRate = parseFloat((data.readU8() / 100).toFixed(2));
                    } else {
                        FC.RC_TUNING.rcYawRate = 0;
                    }
                } else {
                    FC.RC_TUNING.RC_YAW_EXPO = 0;
                }
                if (semver.gte(FC.CONFIG.apiVersion, "1.37.0")) {
                    FC.RC_TUNING.rcPitchRate = parseFloat((data.readU8() / 100).toFixed(2));
                    FC.RC_TUNING.RC_PITCH_EXPO = parseFloat((data.readU8() / 100).toFixed(2));
                } else {
                    FC.RC_TUNING.rcPitchRate = 0;
                    FC.RC_TUNING.RC_PITCH_EXPO = 0;
                }
                if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                    FC.RC_TUNING.throttleLimitType = data.readU8();
                    FC.RC_TUNING.throttleLimitPercent = data.readU8();
                }
                if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                    FC.RC_TUNING.roll_rate_limit = data.readU16();
                    FC.RC_TUNING.pitch_rate_limit = data.readU16();
                    FC.RC_TUNING.yaw_rate_limit = data.readU16();
                }
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                    FC.RC_TUNING.rates_type = data.readU8();
                }
                break;
            case MSPCodes.MSP_PID:
                // PID data arrived, we need to scale it and save to appropriate bank / array
                for (let i = 0, needle = 0; i < (data.byteLength / 3); i++, needle += 3) {
                    // main for loop selecting the pid section
                    for (var j = 0; j < 3; j++) {
                        FC.PIDS_ACTIVE[i][j] = data.readU8();
                        FC.PIDS[i][j] = FC.PIDS_ACTIVE[i][j];
                    }
                }
                break;

            case MSPCodes.MSP_ARMING_CONFIG:
                if (semver.gte(FC.CONFIG.apiVersion, "1.8.0")) {
                    FC.ARMING_CONFIG.auto_disarm_delay = data.readU8();
                    FC.ARMING_CONFIG.disarm_kill_switch = data.readU8();
                }
                if (semver.gte(FC.CONFIG.apiVersion, "1.37.0")) {
                    FC.ARMING_CONFIG.small_angle = data.readU8();
                }
                break;
            case MSPCodes.MSP_LOOP_TIME:
                if (semver.gte(FC.CONFIG.apiVersion, "1.8.0")) {
                    FC.FC_CONFIG.loopTime = data.readU16();
                }
                break;
            case MSPCodes.MSP_MISC: // 22 bytes
                FC.RX_CONFIG.midrc = data.readU16();
                FC.MOTOR_CONFIG.minthrottle = data.readU16(); // 0-2000
                FC.MOTOR_CONFIG.maxthrottle = data.readU16(); // 0-2000
                FC.MOTOR_CONFIG.mincommand = data.readU16(); // 0-2000
                FC.MISC.failsafe_throttle = data.readU16(); // 1000-2000
                FC.GPS_CONFIG.provider = data.readU8();
                FC.MISC.gps_baudrate = data.readU8();
                FC.GPS_CONFIG.ublox_sbas = data.readU8();
                FC.MISC.multiwiicurrentoutput = data.readU8();
                FC.RSSI_CONFIG.channel = data.readU8();
                FC.MISC.placeholder2 = data.readU8();
                data.read16(); // was mag_declination
                FC.MISC.vbatscale = data.readU8(); // was FC.MISC.vbatscale - 10-200
                FC.MISC.vbatmincellvoltage = data.readU8() / 10; // 10-50
                FC.MISC.vbatmaxcellvoltage = data.readU8() / 10; // 10-50
                FC.MISC.vbatwarningcellvoltage = data.readU8() / 10; // 10-50
                break;
            case MSPCodes.MSP_MOTOR_CONFIG:
                FC.MOTOR_CONFIG.minthrottle = data.readU16(); // 0-2000
                FC.MOTOR_CONFIG.maxthrottle = data.readU16(); // 0-2000
                FC.MOTOR_CONFIG.mincommand = data.readU16(); // 0-2000
                if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                    FC.MOTOR_CONFIG.motor_count = data.readU8();
                    FC.MOTOR_CONFIG.motor_poles = data.readU8();
                    FC.MOTOR_CONFIG.use_dshot_telemetry = data.readU8() != 0;
                    FC.MOTOR_CONFIG.use_esc_sensor = data.readU8() != 0;
                }
                break;
            case MSPCodes.MSP_GPS_CONFIG:
                FC.GPS_CONFIG.provider = data.readU8();
                FC.GPS_CONFIG.ublox_sbas = data.readU8();
                if (semver.gte(FC.CONFIG.apiVersion, "1.34.0")) {
                    FC.GPS_CONFIG.auto_config = data.readU8();
                    FC.GPS_CONFIG.auto_baud = data.readU8();

                    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                        FC.GPS_CONFIG.home_point_once = data.readU8();
                        FC.GPS_CONFIG.ublox_use_galileo = data.readU8();
                    }
                }
                break;
            case MSPCodes.MSP_GPS_RESCUE:
                FC.GPS_RESCUE.angle             = data.readU16();
                FC.GPS_RESCUE.initialAltitudeM  = data.readU16();
                FC.GPS_RESCUE.descentDistanceM  = data.readU16();
                FC.GPS_RESCUE.rescueGroundspeed = data.readU16();
                FC.GPS_RESCUE.throttleMin       = data.readU16();
                FC.GPS_RESCUE.throttleMax       = data.readU16();
                FC.GPS_RESCUE.throttleHover     = data.readU16();
                FC.GPS_RESCUE.sanityChecks      = data.readU8();
                FC.GPS_RESCUE.minSats           = data.readU8();
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                    FC.GPS_RESCUE.ascendRate            = data.readU16();
                    FC.GPS_RESCUE.descendRate           = data.readU16();
                    FC.GPS_RESCUE.allowArmingWithoutFix = data.readU8();
                    FC.GPS_RESCUE.altitudeMode          = data.readU8();
                }
                break;
            case MSPCodes.MSP_RSSI_CONFIG:
                FC.RSSI_CONFIG.channel = data.readU8();
                break;
            case MSPCodes.MSP_MOTOR_3D_CONFIG:
                FC.MOTOR_3D_CONFIG.deadband3d_low = data.readU16();
                FC.MOTOR_3D_CONFIG.deadband3d_high = data.readU16();
                FC.MOTOR_3D_CONFIG.neutral = data.readU16();
                if (semver.lt(FC.CONFIG.apiVersion, "1.17.0")) {
                    FC.RC_DEADBAND_CONFIG.deadband3d_throttle = data.readU16();
                }
                break;
            case MSPCodes.MSP_BOXNAMES:
                FC.AUX_CONFIG = []; // empty the array as new data is coming in

                var buff = [];
                for (let i = 0; i < data.byteLength; i++) {
                    var char = data.readU8();
                    if (char == 0x3B) { // ; (delimeter char)
                        FC.AUX_CONFIG.push(String.fromCharCode.apply(null, buff)); // convert bytes into ASCII and save as strings

                        // empty buffer
                        buff = [];
                    } else {
                        buff.push(char);
                    }
                }
                break;
            case MSPCodes.MSP_PIDNAMES:
                FC.PID_NAMES = []; // empty the array as new data is coming in

                var buff = [];
                for (let i = 0; i < data.byteLength; i++) {
                    var char = data.readU8();
                    if (char == 0x3B) { // ; (delimeter char)
                        FC.PID_NAMES.push(String.fromCharCode.apply(null, buff)); // convert bytes into ASCII and save as strings

                        // empty buffer
                        buff = [];
                    } else {
                        buff.push(char);
                    }
                }
                break;
            case MSPCodes.MSP_BOXIDS:
                FC.AUX_CONFIG_IDS = []; // empty the array as new data is coming in

                for (let i = 0; i < data.byteLength; i++) {
                    FC.AUX_CONFIG_IDS.push(data.readU8());
                }
                break;
            case MSPCodes.MSP_SERVO_MIX_RULES:
                break;

            case MSPCodes.MSP_SERVO_CONFIGURATIONS:
                FC.SERVO_CONFIG = []; // empty the array as new data is coming in
                if (semver.gte(FC.CONFIG.apiVersion, "1.33.0")) {
                    if (data.byteLength % 12 == 0) {
                        for (let i = 0; i < data.byteLength; i += 12) {
                            var arr = {
                                'min':                      data.readU16(),
                                'max':                      data.readU16(),
                                'middle':                   data.readU16(),
                                'rate':                     data.read8(),
                                'indexOfChannelToForward':  data.readU8(),
                                'reversedInputSources':     data.readU32()
                            };

                            FC.SERVO_CONFIG.push(arr);
                        }
                    }
                } else if (semver.gte(FC.CONFIG.apiVersion, "1.12.0")) {
                    if (data.byteLength % 14 == 0) {
                        for (let i = 0; i < data.byteLength; i += 14) {
                            var arr = {
                                'min':                      data.readU16(),
                                'max':                      data.readU16(),
                                'middle':                   data.readU16(),
                                'rate':                     data.read8(),
                                'angleAtMin':               data.readU8(),
                                'angleAtMax':               data.readU8(),
                                'indexOfChannelToForward':  data.readU8(),
                                'reversedInputSources':     data.readU32()
                            };

                            FC.SERVO_CONFIG.push(arr);
                        }
                    }
                } else {
                    if (data.byteLength % 7 == 0) {
                        for (let i = 0; i < data.byteLength; i += 7) {
                            var arr = {
                                'min':                      data.readU16(),
                                'max':                      data.readU16(),
                                'middle':                   data.readU16(),
                                'rate':                     data.read8(),
                                'angleAtMin':               45,
                                'angleAtMax':               45,
                                'indexOfChannelToForward':  undefined,
                                'reversedInputSources':     0
                            };

                            FC.SERVO_CONFIG.push(arr);
                        }
                    }

                    if (semver.eq(FC.CONFIG.apiVersion, '1.10.0')) {
                        // drop two unused servo configurations due to MSP rx buffer to small)
                        while (FC.SERVO_CONFIG.length > 8) {
                            FC.SERVO_CONFIG.pop();
                        }
                    }
                }
                break;
            case MSPCodes.MSP_RC_DEADBAND:
                FC.RC_DEADBAND_CONFIG.deadband = data.readU8();
                FC.RC_DEADBAND_CONFIG.yaw_deadband = data.readU8();
                FC.RC_DEADBAND_CONFIG.alt_hold_deadband = data.readU8();

                if (semver.gte(FC.CONFIG.apiVersion, "1.17.0")) {
                    FC.RC_DEADBAND_CONFIG.deadband3d_throttle = data.readU16();
                }
                break;
            case MSPCodes.MSP_SENSOR_ALIGNMENT:
                FC.SENSOR_ALIGNMENT.align_gyro = data.readU8();
                FC.SENSOR_ALIGNMENT.align_acc = data.readU8();
                FC.SENSOR_ALIGNMENT.align_mag = data.readU8();

                if (semver.gte(FC.CONFIG.apiVersion, '1.41.0')) {
                    FC.SENSOR_ALIGNMENT.gyro_detection_flags = data.readU8();
                    FC.SENSOR_ALIGNMENT.gyro_to_use = data.readU8();
                    FC.SENSOR_ALIGNMENT.gyro_1_align = data.readU8();
                    FC.SENSOR_ALIGNMENT.gyro_2_align = data.readU8();
                }
                break;
            case MSPCodes.MSP_DISPLAYPORT:
                break;
            case MSPCodes.MSP_SET_RAW_RC:
                break;
            case MSPCodes.MSP_SET_PID:
                console.log('PID settings saved');
                FC.PIDS_ACTIVE = FC.PIDS.map(array => array.slice());
                break;
            case MSPCodes.MSP_SET_RC_TUNING:
                console.log('RC Tuning saved');
                break;
            case MSPCodes.MSP_ACC_CALIBRATION:
                console.log('Accel calibration executed');
                break;
            case MSPCodes.MSP_MAG_CALIBRATION:
                console.log('Mag calibration executed');
                break;
            case MSPCodes.MSP_SET_MOTOR_CONFIG:
                console.log('Motor Configuration saved');
                break;
            case MSPCodes.MSP_SET_GPS_CONFIG:
                console.log('GPS Configuration saved');
                break;
            case MSPCodes.MSP_SET_RSSI_CONFIG:
                console.log('RSSI Configuration saved');
                break;
            case MSPCodes.MSP_SET_FEATURE_CONFIG:
                console.log('Features saved');
                break;
            case MSPCodes.MSP_SET_BEEPER_CONFIG:
                console.log('Beeper Configuration saved');
                break;
            case MSPCodes.MSP_RESET_CONF:
                console.log('Settings Reset');
                break;
            case MSPCodes.MSP_SELECT_SETTING:
                console.log('Profile selected');
                break;
            case MSPCodes.MSP_SET_SERVO_CONFIGURATION:
                console.log('Servo Configuration saved');
                break;
            case MSPCodes.MSP_EEPROM_WRITE:
                console.log('Settings Saved in EEPROM');
                break;
            case MSPCodes.MSP_SET_CURRENT_METER_CONFIG:
                console.log('Amperage Settings saved');
                break;
            case MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG:
                console.log('Voltage config saved');
            case MSPCodes.MSP_DEBUG:
                for (let i = 0; i < 4; i++)
                    FC.SENSOR_DATA.debug[i] = data.read16();
                break;
            case MSPCodes.MSP_SET_MOTOR:
                console.log('Motor Speeds Updated');
                break;
            case MSPCodes.MSP_UID:
                FC.CONFIG.uid[0] = data.readU32();
                FC.CONFIG.uid[1] = data.readU32();
                FC.CONFIG.uid[2] = data.readU32();
                break;
            case MSPCodes.MSP_ACC_TRIM:
                FC.CONFIG.accelerometerTrims[0] = data.read16(); // pitch
                FC.CONFIG.accelerometerTrims[1] = data.read16(); // roll
                break;
            case MSPCodes.MSP_SET_ACC_TRIM:
                console.log('Accelerometer trimms saved.');
                break;
            case MSPCodes.MSP_GPS_SV_INFO:
                if (data.byteLength > 0) {
                    var numCh = data.readU8();

                    for (let i = 0; i < numCh; i++) {
                        FC.GPS_DATA.chn[i] = data.readU8();
                        FC.GPS_DATA.svid[i] = data.readU8();
                        FC.GPS_DATA.quality[i] = data.readU8();
                        FC.GPS_DATA.cno[i] = data.readU8();
                    }
                }
                break;

            case MSPCodes.MSP_RX_MAP:
                FC.RC_MAP = []; // empty the array as new data is coming in

                for (let i = 0; i < data.byteLength; i++) {
                    FC.RC_MAP.push(data.readU8());
                }
                break;
            case MSPCodes.MSP_SET_RX_MAP:
                console.log('RCMAP saved');
                break;

            case MSPCodes.MSP_MIXER_CONFIG:
                FC.MIXER_CONFIG.mixer = data.readU8();
                if (semver.gte(FC.CONFIG.apiVersion, "1.36.0")) {
                    FC.MIXER_CONFIG.reverseMotorDir = data.readU8();
                }
                break;

            case MSPCodes.MSP_FEATURE_CONFIG:
                FC.FEATURE_CONFIG.features.setMask(data.readU32());

                updateTabList(FC.FEATURE_CONFIG.features);
                break;

            case MSPCodes.MSP_BEEPER_CONFIG:
                FC.BEEPER_CONFIG.beepers.setMask(data.readU32());
                if (semver.gte(FC.CONFIG.apiVersion, "1.37.0")) {
                    FC.BEEPER_CONFIG.dshotBeaconTone = data.readU8();
                }
                if (semver.gte(FC.CONFIG.apiVersion, "1.39.0")) {
                    FC.BEEPER_CONFIG.dshotBeaconConditions.setMask(data.readU32());
                }
                break;

            case MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG:
                FC.BOARD_ALIGNMENT_CONFIG.roll = data.read16(); // -180 - 360
                FC.BOARD_ALIGNMENT_CONFIG.pitch = data.read16(); // -180 - 360
                FC.BOARD_ALIGNMENT_CONFIG.yaw = data.read16(); // -180 - 360
                break;

            case MSPCodes.MSP_SET_REBOOT:
                if (semver.gte(FC.CONFIG.apiVersion, "1.40.0")) {
                    var rebootType = data.read8();
                    if ((rebootType === self.REBOOT_TYPES.MSC) || (rebootType === self.REBOOT_TYPES.MSC_UTC)) {
                        if (data.read8() === 0) {
                            console.log('Storage device not ready.');

                            showErrorDialog(i18n.getMessage('storageDeviceNotReady'));
                            break;
                        }
                    }
                }
                console.log('Reboot request accepted');
                break;

            case MSPCodes.MSP_API_VERSION:
                FC.CONFIG.mspProtocolVersion = data.readU8();
                FC.CONFIG.apiVersion = data.readU8() + '.' + data.readU8() + '.0';
                break;

            case MSPCodes.MSP_FC_VARIANT:
                var identifier = '';
                for (let i = 0; i < 4; i++) {
                    identifier += String.fromCharCode(data.readU8());
                }
                FC.CONFIG.flightControllerIdentifier = identifier;
                break;

            case MSPCodes.MSP_FC_VERSION:
                FC.CONFIG.flightControllerVersion = data.readU8() + '.' + data.readU8() + '.' + data.readU8();
                break;

            case MSPCodes.MSP_BUILD_INFO:
                var dateLength = 11;
                var buff = [];
                for (let i = 0; i < dateLength; i++) {
                    buff.push(data.readU8());
                }
                buff.push(32); // ascii space

                var timeLength = 8;
                for (let i = 0; i < timeLength; i++) {
                    buff.push(data.readU8());
                }
                FC.CONFIG.buildInfo = String.fromCharCode.apply(null, buff);
                break;

            case MSPCodes.MSP_BOARD_INFO:
                var identifier = '';
                for (let i = 0; i < 4; i++) {
                    identifier += String.fromCharCode(data.readU8());
                }
                FC.CONFIG.boardIdentifier = identifier;
                FC.CONFIG.boardVersion = data.readU16();

                if (semver.gte(FC.CONFIG.apiVersion, "1.35.0")) {
                    FC.CONFIG.boardType = data.readU8();
                } else {
                    FC.CONFIG.boardType = 0;
                }

                if (semver.gte(FC.CONFIG.apiVersion, "1.37.0")) {
                    FC.CONFIG.targetCapabilities = data.readU8();

                    let length = data.readU8();
                    for (let i = 0; i < length; i++) {
                        FC.CONFIG.targetName += String.fromCharCode(data.readU8());
                    }
                } else {
                    FC.CONFIG.targetCapabilities = 0;
                    FC.CONFIG.targetName = "";
                }

                if (semver.gte(FC.CONFIG.apiVersion, "1.39.0")) {
                    let length = data.readU8();
                    for (let i = 0; i < length; i++) {
                        FC.CONFIG.boardName += String.fromCharCode(data.readU8());
                    }

                    length = data.readU8();
                    for (let i = 0; i < length; i++) {
                        FC.CONFIG.manufacturerId += String.fromCharCode(data.readU8());
                    }

                    for (let i = 0; i < self.SIGNATURE_LENGTH; i++) {
                        FC.CONFIG.signature.push(data.readU8());
                    }
                } else {
                    FC.CONFIG.boardName = "";
                    FC.CONFIG.manufacturerId = "";
                    FC.CONFIG.signature = [];
                }

                if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                    FC.CONFIG.mcuTypeId = data.readU8();
                } else {
                    FC.CONFIG.mcuTypeId = 255;
                }

                if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                    FC.CONFIG.configurationState = data.readU8();
                }

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                    FC.CONFIG.sampleRateHz = data.readU16();
                    FC.CONFIG.configurationProblems = data.readU32();
                } else {
                    FC.CONFIG.configurationProblems = 0;
                }

                break;

            case MSPCodes.MSP_NAME:
                FC.CONFIG.name = '';
                var char;
                while ((char = data.readU8()) !== null) {
                    FC.CONFIG.name += String.fromCharCode(char);
                }
                break;

            case MSPCodes.MSP_SET_CHANNEL_FORWARDING:
                console.log('Channel forwarding saved');
                break;

            case MSPCodes.MSP_CF_SERIAL_CONFIG:
                FC.SERIAL_CONFIG.ports = [];
                if (semver.lt(FC.CONFIG.apiVersion, "1.6.0")) {
                    const serialPortCount = (data.byteLength - (4 * 4)) / 2;
                    for (let i = 0; i < serialPortCount; i++) {
                        const serialPort = {
                            identifier: data.readU8(),
                            scenario: data.readU8()
                        }
                        FC.SERIAL_CONFIG.ports.push(serialPort);
                    }
                    FC.SERIAL_CONFIG.mspBaudRate = data.readU32();
                    FC.SERIAL_CONFIG.cliBaudRate = data.readU32();
                    FC.SERIAL_CONFIG.gpsBaudRate = data.readU32();
                    FC.SERIAL_CONFIG.gpsPassthroughBaudRate = data.readU32();
                } else {
                    const bytesPerPort = 1 + 2 + (1 * 4);

                    const serialPortCount = data.byteLength / bytesPerPort;
                    for (let i = 0; i < serialPortCount; i++) {
                        const serialPort = {
                            identifier: data.readU8(),
                            functions: self.serialPortFunctionMaskToFunctions(data.readU16()),
                            msp_baudrate: self.BAUD_RATES[data.readU8()],
                            gps_baudrate: self.BAUD_RATES[data.readU8()],
                            telemetry_baudrate: self.BAUD_RATES[data.readU8()],
                            blackbox_baudrate: self.BAUD_RATES[data.readU8()]
                        }

                        FC.SERIAL_CONFIG.ports.push(serialPort);
                    }
                }
                break;

            case MSPCodes.MSP2_COMMON_SERIAL_CONFIG:
                FC.SERIAL_CONFIG.ports = [];
                const count = data.readU8();
                const portConfigSize = data.remaining() / count;
                for (let ii = 0; ii < count; ii++) {
                    const start = data.remaining();
                    const serialPort = {
                        identifier: data.readU8(),
                        functions: self.serialPortFunctionMaskToFunctions(data.readU32()),
                        msp_baudrate: self.BAUD_RATES[data.readU8()],
                        gps_baudrate: self.BAUD_RATES[data.readU8()],
                        telemetry_baudrate: self.BAUD_RATES[data.readU8()],
                        blackbox_baudrate: self.BAUD_RATES[data.readU8()],
                    };
                    FC.SERIAL_CONFIG.ports.push(serialPort);
                    while(start - data.remaining() < portConfigSize && data.remaining() > 0) {
                        data.readU8();
                    }
                }
                break;

            case MSPCodes.MSP_SET_CF_SERIAL_CONFIG:
                console.log('Serial config saved');
                break;

            case MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG:
                console.log('Serial config saved (MSPv2)');
                break;

            case MSPCodes.MSP_MODE_RANGES:
                FC.MODE_RANGES = []; // empty the array as new data is coming in

                var modeRangeCount = data.byteLength / 4; // 4 bytes per item.

                for (let i = 0; i < modeRangeCount; i++) {
                    var modeRange = {
                        id: data.readU8(),
                        auxChannelIndex: data.readU8(),
                        range: {
                            start: 900 + (data.readU8() * 25),
                            end: 900 + (data.readU8() * 25)
                        }
                    };
                    FC.MODE_RANGES.push(modeRange);
                }
                break;

            case MSPCodes.MSP_MODE_RANGES_EXTRA:
                FC.MODE_RANGES_EXTRA = []; // empty the array as new data is coming in

                var modeRangeExtraCount = data.readU8();

                for (let i = 0; i < modeRangeExtraCount; i++) {
                    var modeRangeExtra = {
                        id: data.readU8(),
                        modeLogic: data.readU8(),
                        linkedTo: data.readU8()
                    };
                    FC.MODE_RANGES_EXTRA.push(modeRangeExtra);
                }
                break;

            case MSPCodes.MSP_ADJUSTMENT_RANGES:
                FC.ADJUSTMENT_RANGES = []; // empty the array as new data is coming in

                var adjustmentRangeCount = data.byteLength / 6; // 6 bytes per item.

                for (let i = 0; i < adjustmentRangeCount; i++) {
                    var adjustmentRange = {
                        slotIndex: data.readU8(),
                        auxChannelIndex: data.readU8(),
                        range: {
                            start: 900 + (data.readU8() * 25),
                            end: 900 + (data.readU8() * 25)
                        },
                        adjustmentFunction: data.readU8(),
                        auxSwitchChannelIndex: data.readU8()
                    };
                    FC.ADJUSTMENT_RANGES.push(adjustmentRange);
                }
                break;

            case MSPCodes.MSP_RX_CONFIG:
                FC.RX_CONFIG.serialrx_provider = data.readU8();
                FC.RX_CONFIG.stick_max = data.readU16();
                FC.RX_CONFIG.stick_center = data.readU16();
                FC.RX_CONFIG.stick_min = data.readU16();
                FC.RX_CONFIG.spektrum_sat_bind = data.readU8();
                FC.RX_CONFIG.rx_min_usec = data.readU16();
                FC.RX_CONFIG.rx_max_usec = data.readU16();
                if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
                    FC.RX_CONFIG.rcInterpolation = data.readU8();
                    FC.RX_CONFIG.rcInterpolationInterval = data.readU8();
                    FC.RX_CONFIG.airModeActivateThreshold = data.readU16();
                    if (semver.gte(FC.CONFIG.apiVersion, "1.31.0")) {
                        FC.RX_CONFIG.rxSpiProtocol = data.readU8();
                        FC.RX_CONFIG.rxSpiId = data.readU32();
                        FC.RX_CONFIG.rxSpiRfChannelCount = data.readU8();
                        FC.RX_CONFIG.fpvCamAngleDegrees = data.readU8();
                        if (semver.gte(FC.CONFIG.apiVersion, "1.40.0")) {
                            FC.RX_CONFIG.rcInterpolationChannels = data.readU8();
                            FC.RX_CONFIG.rcSmoothingType = data.readU8();
                            FC.RX_CONFIG.rcSmoothingInputCutoff = data.readU8();
                            FC.RX_CONFIG.rcSmoothingDerivativeCutoff = data.readU8();
                            FC.RX_CONFIG.rcSmoothingInputType = data.readU8();
                            FC.RX_CONFIG.rcSmoothingDerivativeType = data.readU8();
                            if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                                FC.RX_CONFIG.usbCdcHidType = data.readU8();
                                FC.RX_CONFIG.rcSmoothingAutoSmoothness = data.readU8();
                            }
                        }
                    } else {
                        FC.RX_CONFIG.rxSpiProtocol = 0;
                        FC.RX_CONFIG.rxSpiId = 0;
                        FC.RX_CONFIG.rxSpiRfChannelCount = 0;
                        FC.RX_CONFIG.fpvCamAngleDegrees = 0;
                    }
                } else {
                    FC.RX_CONFIG.rcInterpolation = 0;
                    FC.RX_CONFIG.rcInterpolationInterval = 0;
                    FC.RX_CONFIG.airModeActivateThreshold = 0;
                }

                
                break;

            case MSPCodes.MSP_FAILSAFE_CONFIG:
                FC.FAILSAFE_CONFIG.failsafe_delay = data.readU8();
                FC.FAILSAFE_CONFIG.failsafe_off_delay = data.readU8();
                FC.FAILSAFE_CONFIG.failsafe_throttle = data.readU16();
                if (semver.gte(FC.CONFIG.apiVersion, "1.15.0")) {
                    FC.FAILSAFE_CONFIG.failsafe_switch_mode = data.readU8();
                    FC.FAILSAFE_CONFIG.failsafe_throttle_low_delay = data.readU16();
                    FC.FAILSAFE_CONFIG.failsafe_procedure = data.readU8();
                }
                break;

            case MSPCodes.MSP_RXFAIL_CONFIG:
                FC.RXFAIL_CONFIG = []; // empty the array as new data is coming in

                var channelCount = data.byteLength / 3;
                for (let i = 0; i < channelCount; i++) {
                    var rxfailChannel = {
                        mode:  data.readU8(),
                        value: data.readU16()
                    };
                    FC.RXFAIL_CONFIG.push(rxfailChannel);
                }
                break;

            case MSPCodes.MSP_ADVANCED_CONFIG:
                FC.PID_ADVANCED_CONFIG.gyro_sync_denom = data.readU8();
                FC.PID_ADVANCED_CONFIG.pid_process_denom = data.readU8();
                FC.PID_ADVANCED_CONFIG.use_unsyncedPwm = data.readU8();
                FC.PID_ADVANCED_CONFIG.fast_pwm_protocol = self.reorderPwmProtocols(data.readU8());
                FC.PID_ADVANCED_CONFIG.motor_pwm_rate = data.readU16();
                if (semver.gte(FC.CONFIG.apiVersion, "1.24.0")) {
                    FC.PID_ADVANCED_CONFIG.digitalIdlePercent = data.readU16() / 100;

                    if (semver.gte(FC.CONFIG.apiVersion, "1.25.0")) {
                        let gyroUse32kHz = data.readU8();
                        if (semver.lt(FC.CONFIG.apiVersion, "1.41.0")) {
                            FC.PID_ADVANCED_CONFIG.gyroUse32kHz = gyroUse32kHz;
                        } 
                        if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                            FC.PID_ADVANCED_CONFIG.motorPwmInversion = data.readU8();
                            FC.SENSOR_ALIGNMENT.gyro_to_use = data.readU8(); // We don't want to double up on storing this state
                            FC.PID_ADVANCED_CONFIG.gyroHighFsr = data.readU8();
                            FC.PID_ADVANCED_CONFIG.gyroMovementCalibThreshold = data.readU8();
                            FC.PID_ADVANCED_CONFIG.gyroCalibDuration = data.readU16();
                            FC.PID_ADVANCED_CONFIG.gyroOffsetYaw = data.readU16();
                            FC.PID_ADVANCED_CONFIG.gyroCheckOverflow = data.readU8();
                            FC.PID_ADVANCED_CONFIG.debugMode = data.readU8();
                            FC.PID_ADVANCED_CONFIG.debugModeCount = data.readU8();
                        }
                    }
                }
                break;
            case MSPCodes.MSP_FILTER_CONFIG:
                FC.FILTER_CONFIG.gyro_lowpass_hz = data.readU8();
                FC.FILTER_CONFIG.dterm_lowpass_hz = data.readU16();
                FC.FILTER_CONFIG.yaw_lowpass_hz = data.readU16();
                if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
                    FC.FILTER_CONFIG.gyro_notch_hz = data.readU16();
                    FC.FILTER_CONFIG.gyro_notch_cutoff = data.readU16();
                    FC.FILTER_CONFIG.dterm_notch_hz = data.readU16();
                    FC.FILTER_CONFIG.dterm_notch_cutoff = data.readU16();
                    if (semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {
                        FC.FILTER_CONFIG.gyro_notch2_hz = data.readU16();
                        FC.FILTER_CONFIG.gyro_notch2_cutoff = data.readU16();
                    }
                    if (semver.gte(FC.CONFIG.apiVersion, "1.36.0")) {
                        FC.FILTER_CONFIG.dterm_lowpass_type = data.readU8();
                    }
                    if (semver.gte(FC.CONFIG.apiVersion, "1.39.0")) {
                        FC.FILTER_CONFIG.gyro_hardware_lpf = data.readU8();
                        let gyro_32khz_hardware_lpf = data.readU8();
                        FC.FILTER_CONFIG.gyro_lowpass_hz = data.readU16();
                        FC.FILTER_CONFIG.gyro_lowpass2_hz = data.readU16();
                        FC.FILTER_CONFIG.gyro_lowpass_type = data.readU8();
                        FC.FILTER_CONFIG.gyro_lowpass2_type = data.readU8();
                        FC.FILTER_CONFIG.dterm_lowpass2_hz = data.readU16();
                        if (semver.lt(FC.CONFIG.apiVersion, "1.41.0")) {
                            FC.FILTER_CONFIG.gyro_32khz_hardware_lpf = gyro_32khz_hardware_lpf;
                        } else {
                            FC.FILTER_CONFIG.gyro_32khz_hardware_lpf = 0;

                            FC.FILTER_CONFIG.dterm_lowpass2_type = data.readU8();
                            FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = data.readU16();
                            FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = data.readU16();
                            FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = data.readU16();
                            FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz = data.readU16();
                            if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                                FC.FILTER_CONFIG.dyn_notch_range = data.readU8();
                                FC.FILTER_CONFIG.dyn_notch_width_percent = data.readU8();
                                FC.FILTER_CONFIG.dyn_notch_q = data.readU16();
                                FC.FILTER_CONFIG.dyn_notch_min_hz = data.readU16();

                                FC.FILTER_CONFIG.gyro_rpm_notch_harmonics = data.readU8();
                                FC.FILTER_CONFIG.gyro_rpm_notch_min_hz = data.readU8();
                            }
                            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                                FC.FILTER_CONFIG.dyn_notch_max_hz = data.readU16();
                            }
                            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                                FC.FILTER_CONFIG.dyn_lpf_curve_expo = data.readU8();
                            }
                        }
                    }
                }
                break;
            case MSPCodes.MSP_SET_PID_ADVANCED:
                console.log("Advanced PID settings saved");
                FC.ADVANCED_TUNING_ACTIVE = { ...FC.ADVANCED_TUNING };
                break;
            case MSPCodes.MSP_PID_ADVANCED:
                FC.ADVANCED_TUNING.rollPitchItermIgnoreRate = data.readU16();
                FC.ADVANCED_TUNING.yawItermIgnoreRate = data.readU16();
                FC.ADVANCED_TUNING.yaw_p_limit = data.readU16();
                FC.ADVANCED_TUNING.deltaMethod = data.readU8();
                FC.ADVANCED_TUNING.vbatPidCompensation = data.readU8();
                if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
                    if (semver.gte(FC.CONFIG.apiVersion, "1.40.0")) {
                        FC.ADVANCED_TUNING.feedforwardTransition = data.readU8();
                    } else {
                        FC.ADVANCED_TUNING.dtermSetpointTransition = data.readU8();
                    }
                    FC.ADVANCED_TUNING.dtermSetpointWeight = data.readU8();
                    FC.ADVANCED_TUNING.toleranceBand = data.readU8();
                    FC.ADVANCED_TUNING.toleranceBandReduction = data.readU8();
                    FC.ADVANCED_TUNING.itermThrottleGain = data.readU8();
                    FC.ADVANCED_TUNING.pidMaxVelocity = data.readU16();
                    FC.ADVANCED_TUNING.pidMaxVelocityYaw = data.readU16();
                    if (semver.gte(FC.CONFIG.apiVersion, "1.24.0")) {
                        FC.ADVANCED_TUNING.levelAngleLimit = data.readU8();
                        FC.ADVANCED_TUNING.levelSensitivity = data.readU8();

                        if (semver.gte(FC.CONFIG.apiVersion, "1.36.0")) {
                            FC.ADVANCED_TUNING.itermThrottleThreshold = data.readU16();
                            FC.ADVANCED_TUNING.itermAcceleratorGain = data.readU16();

                            if (semver.gte(FC.CONFIG.apiVersion, "1.39.0")) {
                                FC.ADVANCED_TUNING.dtermSetpointWeight = data.readU16();

                                if (semver.gte(FC.CONFIG.apiVersion, "1.40.0")) {
                                    FC.ADVANCED_TUNING.itermRotation = data.readU8();
                                    FC.ADVANCED_TUNING.smartFeedforward = data.readU8();
                                    FC.ADVANCED_TUNING.itermRelax = data.readU8();
                                    FC.ADVANCED_TUNING.itermRelaxType = data.readU8();
                                    FC.ADVANCED_TUNING.absoluteControlGain = data.readU8();
                                    FC.ADVANCED_TUNING.throttleBoost = data.readU8();
                                    FC.ADVANCED_TUNING.acroTrainerAngleLimit = data.readU8();
                                    FC.ADVANCED_TUNING.feedforwardRoll  = data.readU16();
                                    FC.ADVANCED_TUNING.feedforwardPitch = data.readU16();
                                    FC.ADVANCED_TUNING.feedforwardYaw   = data.readU16();
                                    FC.ADVANCED_TUNING.antiGravityMode  = data.readU8();
                                    
                                    if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                                        FC.ADVANCED_TUNING.dMinRoll = data.readU8();
                                        FC.ADVANCED_TUNING.dMinPitch = data.readU8();
                                        FC.ADVANCED_TUNING.dMinYaw = data.readU8();
                                        FC.ADVANCED_TUNING.dMinGain = data.readU8();
                                        FC.ADVANCED_TUNING.dMinAdvance = data.readU8();
                                        FC.ADVANCED_TUNING.useIntegratedYaw = data.readU8();
                                        FC.ADVANCED_TUNING.integratedYawRelax = data.readU8();

                                        if(semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                                            FC.ADVANCED_TUNING.itermRelaxCutoff = data.readU8();

                                            if(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                                                FC.ADVANCED_TUNING.motorOutputLimit = data.readU8();
                                                FC.ADVANCED_TUNING.autoProfileCellCount = data.read8();
                                                FC.ADVANCED_TUNING.idleMinRpm = data.readU8();

                                                if(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                                                    FC.ADVANCED_TUNING.ff_interpolate_sp = data.readU8();
                                                    FC.ADVANCED_TUNING.ff_smooth_factor = data.readU8();
                                                    FC.ADVANCED_TUNING.ff_boost = data.readU8();
                                                    FC.ADVANCED_TUNING.vbat_sag_compensation = data.readU8();
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                FC.ADVANCED_TUNING_ACTIVE = { ...FC.ADVANCED_TUNING };
                break;
            case MSPCodes.MSP_SENSOR_CONFIG:
                FC.SENSOR_CONFIG.acc_hardware = data.readU8();
                FC.SENSOR_CONFIG.baro_hardware = data.readU8();
                FC.SENSOR_CONFIG.mag_hardware = data.readU8();
                break;

            case MSPCodes.MSP_LED_STRIP_CONFIG:
                FC.LED_STRIP = [];

                var ledDirectionLetters =       ['n', 'e', 's', 'w', 'u', 'd'];      // in LSB bit order
                var ledFunctionLetters =        ['i', 'w', 'f', 'a', 't', 'r', 'c', 'g', 's', 'b', 'l']; // in LSB bit order
                var ledBaseFunctionLetters =    ['c', 'f', 'a', 'l', 's', 'g', 'r']; // in LSB bit
                if (semver.lt(FC.CONFIG.apiVersion, "1.36.0")) {
                    var ledOverlayLetters =     ['t', 'o', 'b', 'n', 'i', 'w']; // in LSB bit
                } else {
                    var ledOverlayLetters =     ['t', 'o', 'b', 'v', 'i', 'w']; // in LSB bit
                }


                var ledCount = data.byteLength / 7; // v1.4.0 and below incorrectly reported 4 bytes per led.
                if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
                    ledCount = data.byteLength / 4;
                }
                if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                    // According to betaflight/src/main/msp/msp.c
                    // API 1.41 - add indicator for advanced profile support and the current profile selection
                    // 0 = basic ledstrip available
                    // 1 = advanced ledstrip available
                    // Following byte is the current LED profile
                    ledCount = (data.byteLength - 2) / 4;
                }
                for (let i = 0; i < ledCount; i++) {

                    if (semver.lt(FC.CONFIG.apiVersion, "1.20.0")) {
                        var directionMask = data.readU16();

                        var directions = [];
                        for (var directionLetterIndex = 0; directionLetterIndex < ledDirectionLetters.length; directionLetterIndex++) {
                            if (bit_check(directionMask, directionLetterIndex)) {
                                directions.push(ledDirectionLetters[directionLetterIndex]);
                            }
                        }

                        const functionMask = data.readU16();

                        var functions = [];
                        for (var functionLetterIndex = 0; functionLetterIndex < ledFunctionLetters.length; functionLetterIndex++) {
                            if (bit_check(functionMask, functionLetterIndex)) {
                                functions.push(ledFunctionLetters[functionLetterIndex]);
                            }
                        }

                        var led = {
                            directions: directions,
                            functions: functions,
                            x: data.readU8(),
                            y: data.readU8(),
                            color: data.readU8()
                        };

                        FC.LED_STRIP.push(led);
                    } else {
                        var mask = data.readU32();

                        var functionId = (mask >> 8) & 0xF;
                        var functions = [];
                        for (var baseFunctionLetterIndex = 0; baseFunctionLetterIndex < ledBaseFunctionLetters.length; baseFunctionLetterIndex++) {
                            if (functionId == baseFunctionLetterIndex) {
                                functions.push(ledBaseFunctionLetters[baseFunctionLetterIndex]);
                                break;
                            }
                        }

                        var overlayMask = (mask >> 12) & 0x3F;
                        for (var overlayLetterIndex = 0; overlayLetterIndex < ledOverlayLetters.length; overlayLetterIndex++) {
                            if (bit_check(overlayMask, overlayLetterIndex)) {
                                functions.push(ledOverlayLetters[overlayLetterIndex]);
                            }
                        }

                        var directionMask = (mask >> 22) & 0x3F;
                        var directions = [];
                        for (var directionLetterIndex = 0; directionLetterIndex < ledDirectionLetters.length; directionLetterIndex++) {
                            if (bit_check(directionMask, directionLetterIndex)) {
                                directions.push(ledDirectionLetters[directionLetterIndex]);
                            }
                        }
                        var led = {
                            y: (mask) & 0xF,
                            x: (mask >> 4) & 0xF,
                            functions: functions,
                            color: (mask >> 18) & 0xF,
                            directions: directions,
                            parameters: (mask >> 28) & 0xF
                        };

                        FC.LED_STRIP.push(led);
                    }
                }
                break;
            case MSPCodes.MSP_SET_LED_STRIP_CONFIG:
                console.log('Led strip config saved');
                break;
            case MSPCodes.MSP_LED_COLORS:

                FC.LED_COLORS = [];

                var colorCount = data.byteLength / 4;

                for (let i = 0; i < colorCount; i++) {

                    var color = {
                        h: data.readU16(),
                        s: data.readU8(),
                        v: data.readU8()
                    };
                    FC.LED_COLORS.push(color);
                }

                break;
            case MSPCodes.MSP_SET_LED_COLORS:
                console.log('Led strip colors saved');
                break;
            case MSPCodes.MSP_LED_STRIP_MODECOLOR:
                if (semver.gte(FC.CONFIG.apiVersion, "1.19.0")) {

                    FC.LED_MODE_COLORS = [];

                    var colorCount = data.byteLength / 3;

                    for (let i = 0; i < colorCount; i++) {

                        var mode_color = {
                            mode: data.readU8(),
                            direction: data.readU8(),
                            color: data.readU8()
                        };
                        FC.LED_MODE_COLORS.push(mode_color);
                    }
                }
                break;
            case MSPCodes.MSP_SET_LED_STRIP_MODECOLOR:
                console.log('Led strip mode colors saved');
                break;

            case MSPCodes.MSP_DATAFLASH_SUMMARY:
                if (data.byteLength >= 13) {
                    var flags = data.readU8();
                    FC.DATAFLASH.ready = (flags & 1) != 0;
                    FC.DATAFLASH.supported = (flags & 2) != 0;
                    FC.DATAFLASH.sectors = data.readU32();
                    FC.DATAFLASH.totalSize = data.readU32();
                    FC.DATAFLASH.usedSize = data.readU32();
                } else {
                    // Firmware version too old to support MSP_DATAFLASH_SUMMARY
                    FC.DATAFLASH.ready = false;
                    FC.DATAFLASH.supported = false;
                    FC.DATAFLASH.sectors = 0;
                    FC.DATAFLASH.totalSize = 0;
                    FC.DATAFLASH.usedSize = 0;
                }
                update_dataflash_global();
                break;
            case MSPCodes.MSP_DATAFLASH_READ:
                // No-op, let callback handle it
                break;
            case MSPCodes.MSP_DATAFLASH_ERASE:
                console.log("Data flash erase begun...");
                break;
            case MSPCodes.MSP_SDCARD_SUMMARY:
                var flags = data.readU8();

                FC.SDCARD.supported = (flags & 0x01) != 0;
                FC.SDCARD.state = data.readU8();
                FC.SDCARD.filesystemLastError = data.readU8();
                FC.SDCARD.freeSizeKB = data.readU32();
                FC.SDCARD.totalSizeKB = data.readU32();
                break;
            case MSPCodes.MSP_BLACKBOX_CONFIG:
                FC.BLACKBOX.supported = (data.readU8() & 1) != 0;
                FC.BLACKBOX.blackboxDevice = data.readU8();
                FC.BLACKBOX.blackboxRateNum = data.readU8();
                FC.BLACKBOX.blackboxRateDenom = data.readU8();
                if (semver.gte(FC.CONFIG.apiVersion, "1.36.0")) {
                    FC.BLACKBOX.blackboxPDenom = data.readU16();
                }
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                    FC.BLACKBOX.blackboxSampleRate = data.readU8();
                }
                break;
            case MSPCodes.MSP_SET_BLACKBOX_CONFIG:
                console.log("Blackbox config saved");
                break;
            case MSPCodes.MSP_TRANSPONDER_CONFIG:
                var bytesRemaining = data.byteLength;
                if (semver.gte(FC.CONFIG.apiVersion, "1.33.0")) {
                    var providerCount = data.readU8();
                    bytesRemaining--;

                    FC.TRANSPONDER.supported = providerCount > 0;
                    FC.TRANSPONDER.providers = [];

                    for (let i = 0; i < providerCount; i++) {
                        var provider = {
                            id: data.readU8(),
                            dataLength: data.readU8()
                        };
                        bytesRemaining -= 2;

                        FC.TRANSPONDER.providers.push(provider);
                    }
                    FC.TRANSPONDER.provider = data.readU8();
                    bytesRemaining--;

                } else {
                    FC.TRANSPONDER.supported = (data.readU8() & 1) != 0;
                    bytesRemaining--;

                    // only ILAP was supported prior to 1.33.0
                    FC.TRANSPONDER.providers = [{
                        id: 1, // ILAP
                        dataLength: 6
                    }];
                    FC.TRANSPONDER.provider = FC.TRANSPONDER.providers[0].id;
                }
                FC.TRANSPONDER.data = [];
                for (let i = 0; i < bytesRemaining; i++) {
                    FC.TRANSPONDER.data.push(data.readU8());
                }
                break;

            case MSPCodes.MSP_SET_TRANSPONDER_CONFIG:
                console.log("Transponder config saved");
                break;

            case MSPCodes.MSP_VTX_CONFIG:

                FC.VTX_CONFIG.vtx_type = data.readU8();
                FC.VTX_CONFIG.vtx_band = data.readU8();
                FC.VTX_CONFIG.vtx_channel = data.readU8();
                FC.VTX_CONFIG.vtx_power = data.readU8();
                FC.VTX_CONFIG.vtx_pit_mode = data.readU8() != 0;
                FC.VTX_CONFIG.vtx_frequency = data.readU16();
                FC.VTX_CONFIG.vtx_device_ready = data.readU8() != 0;
                FC.VTX_CONFIG.vtx_low_power_disarm = data.readU8();

                if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                    FC.VTX_CONFIG.vtx_pit_mode_frequency = data.readU16();
                    FC.VTX_CONFIG.vtx_table_available = data.readU8() != 0;
                    FC.VTX_CONFIG.vtx_table_bands = data.readU8();
                    FC.VTX_CONFIG.vtx_table_channels = data.readU8();
                    FC.VTX_CONFIG.vtx_table_powerlevels = data.readU8();
                    FC.VTX_CONFIG.vtx_table_clear = false;
                }
                break;

            case MSPCodes.MSP_SET_VTX_CONFIG:
                console.log("VTX config sent");
                break;

            case MSPCodes.MSP_VTXTABLE_BAND:

                FC.VTXTABLE_BAND.vtxtable_band_number = data.readU8();

                let bandNameLength = data.readU8();
                FC.VTXTABLE_BAND.vtxtable_band_name = '';
                for (let i = 0; i < bandNameLength; i++) {
                    FC.VTXTABLE_BAND.vtxtable_band_name += String.fromCharCode(data.readU8());
                }

                FC.VTXTABLE_BAND.vtxtable_band_letter = String.fromCharCode(data.readU8());
                FC.VTXTABLE_BAND.vtxtable_band_is_factory_band = data.readU8() != 0;

                let bandFrequenciesLength = data.readU8();
                FC.VTXTABLE_BAND.vtxtable_band_frequencies = [];
                for (let i = 0; i < bandFrequenciesLength; i++) {
                    FC.VTXTABLE_BAND.vtxtable_band_frequencies.push(data.readU16());
                }

                break;

            case MSPCodes.MSP_SET_VTXTABLE_BAND:
                console.log("VTX band sent");
                break;

            case MSPCodes.MSP_VTXTABLE_POWERLEVEL:

                FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_number = data.readU8();
                FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_value = data.readU16();

                let powerLabelLength = data.readU8();
                FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label = '';
                for (let i = 0; i < powerLabelLength; i++) {
                    FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label += String.fromCharCode(data.readU8());
                }

                break;

            case MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL:
                console.log("VTX powerlevel sent");
                break;

            case MSPCodes.MSP_SET_MODE_RANGE:
                console.log('Mode range saved');
                break;
            case MSPCodes.MSP_SET_ADJUSTMENT_RANGE:
                console.log('Adjustment range saved');
                break;
            case MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG:
                console.log('Board alignment saved');
                break;
            case MSPCodes.MSP_PID_CONTROLLER:
                FC.PID.controller = data.readU8();
                break;
            case MSPCodes.MSP_SET_PID_CONTROLLER:
                console.log('PID controller changed');
                break;
            case MSPCodes.MSP_SET_LOOP_TIME:
                console.log('Looptime saved');
                break;
            case MSPCodes.MSP_SET_ARMING_CONFIG:
                console.log('Arming config saved');
                break;
            case MSPCodes.MSP_SET_RESET_CURR_PID:
                console.log('Current PID profile reset');
                break;
            case MSPCodes.MSP_SET_MOTOR_3D_CONFIG:
                console.log('3D settings saved');
                break;
            case MSPCodes.MSP_SET_MIXER_CONFIG:
                console.log('Mixer config saved');
                break;
            case MSPCodes.MSP_SET_RC_DEADBAND:
                console.log('Rc controls settings saved');
                break;
            case MSPCodes.MSP_SET_SENSOR_ALIGNMENT:
                console.log('Sensor alignment saved');
                break;
            case MSPCodes.MSP_SET_RX_CONFIG:
                console.log('Rx config saved');
                break;
            case MSPCodes.MSP_SET_RXFAIL_CONFIG:
                console.log('Rxfail config saved');
                break;
            case MSPCodes.MSP_SET_FAILSAFE_CONFIG:
                console.log('Failsafe config saved');
                break;
            case MSPCodes.MSP_OSD_CONFIG:
                break;
            case MSPCodes.MSP_SET_OSD_CONFIG:
                console.log('OSD config set');
                break;
            case MSPCodes.MSP_OSD_CHAR_READ:
                break;
            case MSPCodes.MSP_OSD_CHAR_WRITE:
                console.log('OSD char uploaded');
                break;
            case MSPCodes.MSP_SET_NAME:
                console.log('Name set');
                break;
            case MSPCodes.MSP_SET_FILTER_CONFIG:
                console.log('Filter config set');
                break;
            case MSPCodes.MSP_SET_ADVANCED_CONFIG:
                console.log('Advanced config parameters set');
                break;
            case MSPCodes.MSP_SET_SENSOR_CONFIG:
                console.log('Sensor config parameters set');
                break;
            case MSPCodes.MSP_COPY_PROFILE:
                console.log('Copy profile');
                break;
            case MSPCodes.MSP_ARMING_DISABLE:
                console.log('Arming disable');
                break;
            case MSPCodes.MSP_SET_RTC:
                console.log('Real time clock set');
                break;
            case MSPCodes.MSP_SET_MOTOR_OUTPUT_REORDERING:
                console.log('Motor output reordering set');
                break;

            case MSPCodes.MSP_MULTIPLE_MSP:

                let hasReturnedSomeCommand = false; // To avoid infinite loops

                while (data.offset < data.byteLength) {

                    hasReturnedSomeCommand = true;

                    let command = self.mspMultipleCache.shift();
                    let payloadSize = data.readU8();

                    if (payloadSize != 0) {

                        let currentDataHandler = {
                                code         : command,
                                dataView     : new DataView(data.buffer, data.offset, payloadSize),
                                callbacks    : [],
                        }
    
                        self.process_data(currentDataHandler);

                        data.offset += payloadSize;
                    }
                }

                if (hasReturnedSomeCommand) {
                    // Send again MSP messages missing, the buffer in the FC was too small
                    if (self.mspMultipleCache.length > 0) {
    
                        var partialBuffer = [];
                        for (let i = 0; i < self.mspMultipleCache.length; i++) {
                            partialBuffer.push8(self.mspMultipleCache[i]);
                        }
    
                        MSP.send_message(MSPCodes.MSP_MULTIPLE_MSP, partialBuffer, false, dataHandler.callbacks);
                        dataHandler.callbacks = [];
                    }
                } else {
                    console.log("MSP Multiple can't process the command");
                    self.mspMultipleCache = [];
                }

                break;

            default:
                console.log('Unknown code detected: ' + code);
        } else {
            console.log('FC reports unsupported message error: ' + code);

            switch (code) {
            case MSPCodes.MSP_SET_REBOOT:
                TABS.onboard_logging.mscRebootFailedCallback();

                break;
            }
        }
    }
    // trigger callbacks, cleanup/remove callback after trigger
    for (let i = dataHandler.callbacks.length - 1; i >= 0; i--) { // itterating in reverse because we use .splice which modifies array length
        if (dataHandler.callbacks[i].code == code) {
            // save callback reference
            var callback = dataHandler.callbacks[i].callback;
            var callbackOnError = dataHandler.callbacks[i].callbackOnError;

            // remove timeout
            clearInterval(dataHandler.callbacks[i].timer);

            // remove object from array
            dataHandler.callbacks.splice(i, 1);
            if (!crcError || callbackOnError) {
                // fire callback
                if (callback) callback({'command': code, 'data': data, 'length': data.byteLength, 'crcError': crcError});
            }
        }
    }
}

/**
 * Encode the request body for the MSP request with the given code and return it as an array of bytes.
 */
MspHelper.prototype.crunch = function(code) {
    var buffer = [];
    var self = this;

    switch (code) {
        case MSPCodes.MSP_SET_FEATURE_CONFIG:
            var featureMask = FC.FEATURE_CONFIG.features.getMask();
            buffer.push32(featureMask);
            break;
        case MSPCodes.MSP_SET_BEEPER_CONFIG:
            var beeperMask = FC.BEEPER_CONFIG.beepers.getMask();
            buffer.push32(beeperMask);
            if (semver.gte(FC.CONFIG.apiVersion, "1.37.0")) {
                buffer.push8(FC.BEEPER_CONFIG.dshotBeaconTone);
            }
            if (semver.gte(FC.CONFIG.apiVersion, "1.39.0")) {
                buffer.push32(FC.BEEPER_CONFIG.dshotBeaconConditions.getMask());
            }
            break;
        case MSPCodes.MSP_SET_MIXER_CONFIG:
            buffer.push8(FC.MIXER_CONFIG.mixer)
            if (semver.gte(FC.CONFIG.apiVersion, "1.36.0")) {
                buffer.push8(FC.MIXER_CONFIG.reverseMotorDir);
            }
            break;
        case MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG:
            buffer.push16(FC.BOARD_ALIGNMENT_CONFIG.roll)
                .push16(FC.BOARD_ALIGNMENT_CONFIG.pitch)
                .push16(FC.BOARD_ALIGNMENT_CONFIG.yaw);
            break;
        case MSPCodes.MSP_SET_PID_CONTROLLER:
            buffer.push8(FC.PID.controller);
            break;
        case MSPCodes.MSP_SET_PID:
            for (let i = 0; i < FC.PIDS.length; i++) {
                for (let j = 0; j < 3; j++) {
                    buffer.push8(parseInt(FC.PIDS[i][j]));
                }
            }
            break;
        case MSPCodes.MSP_SET_RC_TUNING:
            buffer.push8(Math.round(FC.RC_TUNING.RC_RATE * 100))
                .push8(Math.round(FC.RC_TUNING.RC_EXPO * 100));
            if (semver.lt(FC.CONFIG.apiVersion, "1.7.0")) {
                buffer.push8(Math.round(FC.RC_TUNING.roll_pitch_rate * 100));
            } else {
                buffer.push8(Math.round(FC.RC_TUNING.roll_rate * 100))
                    .push8(Math.round(FC.RC_TUNING.pitch_rate * 100));
            }
            buffer.push8(Math.round(FC.RC_TUNING.yaw_rate * 100))
                .push8(Math.round(FC.RC_TUNING.dynamic_THR_PID * 100))
                .push8(Math.round(FC.RC_TUNING.throttle_MID * 100))
                .push8(Math.round(FC.RC_TUNING.throttle_EXPO * 100));
            if (semver.gte(FC.CONFIG.apiVersion, "1.7.0")) {
                buffer.push16(FC.RC_TUNING.dynamic_THR_breakpoint);
            }
            if (semver.gte(FC.CONFIG.apiVersion, "1.10.0")) {
                buffer.push8(Math.round(FC.RC_TUNING.RC_YAW_EXPO * 100));
                if (semver.gte(FC.CONFIG.apiVersion, "1.16.0")) {
                    buffer.push8(Math.round(FC.RC_TUNING.rcYawRate * 100));
                }
            }
            if (semver.gte(FC.CONFIG.apiVersion, "1.37.0")) {
                buffer.push8(Math.round(FC.RC_TUNING.rcPitchRate * 100));
                buffer.push8(Math.round(FC.RC_TUNING.RC_PITCH_EXPO * 100));
            }
            if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                buffer.push8(FC.RC_TUNING.throttleLimitType);
                buffer.push8(FC.RC_TUNING.throttleLimitPercent);
            }
            if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                buffer.push16(FC.RC_TUNING.roll_rate_limit);
                buffer.push16(FC.RC_TUNING.pitch_rate_limit);
                buffer.push16(FC.RC_TUNING.yaw_rate_limit);
            }
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                buffer.push8(FC.RC_TUNING.rates_type);
            }
            break;
        case MSPCodes.MSP_SET_RX_MAP:
            for (let i = 0; i < FC.RC_MAP.length; i++) {
                buffer.push8(FC.RC_MAP[i]);
            }
            break;
        case MSPCodes.MSP_SET_ACC_TRIM:
            buffer.push16(FC.CONFIG.accelerometerTrims[0])
                .push16(FC.CONFIG.accelerometerTrims[1]);
            break;
        case MSPCodes.MSP_SET_ARMING_CONFIG:
            buffer.push8(FC.ARMING_CONFIG.auto_disarm_delay)
                .push8(FC.ARMING_CONFIG.disarm_kill_switch);
            if (semver.gte(FC.CONFIG.apiVersion, "1.37.0")) {
                buffer.push8(FC.ARMING_CONFIG.small_angle);
            }
            break;
        case MSPCodes.MSP_SET_LOOP_TIME:
            buffer.push16(FC.FC_CONFIG.loopTime);
            break;
        case MSPCodes.MSP_SET_MISC:
            buffer.push16(FC.RX_CONFIG.midrc)
                .push16(FC.MOTOR_CONFIG.minthrottle)
                .push16(FC.MOTOR_CONFIG.maxthrottle)
                .push16(FC.MOTOR_CONFIG.mincommand)
                .push16(FC.MISC.failsafe_throttle)
                .push8(FC.GPS_CONFIG.provider)
                .push8(FC.MISC.gps_baudrate)
                .push8(FC.GPS_CONFIG.ublox_sbas)
                .push8(FC.MISC.multiwiicurrentoutput)
                .push8(FC.RSSI_CONFIG.channel)
                .push8(FC.MISC.placeholder2)
                .push16(0) // was mag_declination
                .push8(FC.MISC.vbatscale)
                .push8(Math.round(FC.MISC.vbatmincellvoltage * 10))
                .push8(Math.round(FC.MISC.vbatmaxcellvoltage * 10))
                .push8(Math.round(FC.MISC.vbatwarningcellvoltage * 10));
            break;
        case MSPCodes.MSP_SET_MOTOR_CONFIG:
            buffer.push16(FC.MOTOR_CONFIG.minthrottle)
                .push16(FC.MOTOR_CONFIG.maxthrottle)
                .push16(FC.MOTOR_CONFIG.mincommand);
            if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                buffer.push8(FC.MOTOR_CONFIG.motor_poles);
                buffer.push8(FC.MOTOR_CONFIG.use_dshot_telemetry ? 1 : 0);
            }
            break;
        case MSPCodes.MSP_SET_GPS_CONFIG:
            buffer.push8(FC.GPS_CONFIG.provider)
                .push8(FC.GPS_CONFIG.ublox_sbas);
            if (semver.gte(FC.CONFIG.apiVersion, "1.34.0")) {
                buffer.push8(FC.GPS_CONFIG.auto_config)
                    .push8(FC.GPS_CONFIG.auto_baud);

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                    buffer.push8(FC.GPS_CONFIG.home_point_once)
                          .push8(FC.GPS_CONFIG.ublox_use_galileo);
                }
            }
            break;
        case MSPCodes.MSP_SET_GPS_RESCUE:
            buffer.push16(FC.GPS_RESCUE.angle)
                  .push16(FC.GPS_RESCUE.initialAltitudeM)
                  .push16(FC.GPS_RESCUE.descentDistanceM)
                  .push16(FC.GPS_RESCUE.rescueGroundspeed)
                  .push16(FC.GPS_RESCUE.throttleMin)
                  .push16(FC.GPS_RESCUE.throttleMax)
                  .push16(FC.GPS_RESCUE.throttleHover)
                  .push8(FC.GPS_RESCUE.sanityChecks)
                  .push8(FC.GPS_RESCUE.minSats);

                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                    buffer.push16(FC.GPS_RESCUE.ascendRate)
                          .push16(FC.GPS_RESCUE.descendRate)
                          .push8(FC.GPS_RESCUE.allowArmingWithoutFix)
                          .push8(FC.GPS_RESCUE.altitudeMode);
                }
            break;
        case MSPCodes.MSP_SET_RSSI_CONFIG:
            buffer.push8(FC.RSSI_CONFIG.channel);
            break;
        case MSPCodes.MSP_SET_BATTERY_CONFIG:
            buffer.push8(Math.round(FC.BATTERY_CONFIG.vbatmincellvoltage * 10))
                .push8(Math.round(FC.BATTERY_CONFIG.vbatmaxcellvoltage * 10))
                .push8(Math.round(FC.BATTERY_CONFIG.vbatwarningcellvoltage * 10))
                .push16(FC.BATTERY_CONFIG.capacity)
                .push8(FC.BATTERY_CONFIG.voltageMeterSource)
                .push8(FC.BATTERY_CONFIG.currentMeterSource);
                if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                    buffer.push16(Math.round(FC.BATTERY_CONFIG.vbatmincellvoltage * 100))
                        .push16(Math.round(FC.BATTERY_CONFIG.vbatmaxcellvoltage * 100))
                        .push16(Math.round(FC.BATTERY_CONFIG.vbatwarningcellvoltage * 100));
                }
            break;
        case MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG:
            if (semver.lt(FC.CONFIG.apiVersion, "1.36.0")) {
                buffer.push8(FC.MISC.vbatscale)
                    .push8(Math.round(FC.MISC.vbatmincellvoltage * 10))
                    .push8(Math.round(FC.MISC.vbatmaxcellvoltage * 10))
                    .push8(Math.round(FC.MISC.vbatwarningcellvoltage * 10));
                    if (semver.gte(FC.CONFIG.apiVersion, "1.23.0")) {
                        buffer.push8(FC.MISC.batterymetertype);
                    }
            }
           break;
        case MSPCodes.MSP_SET_CURRENT_METER_CONFIG:
            if (semver.lt(FC.CONFIG.apiVersion, "1.36.0"))  {
                buffer.push16(FC.BF_CONFIG.currentscale)
                    .push16(FC.BF_CONFIG.currentoffset)
                    .push8(FC.BF_CONFIG.currentmetertype)
                    .push16(FC.BF_CONFIG.batterycapacity)
            }
            break;

        case MSPCodes.MSP_SET_RX_CONFIG:
            buffer.push8(FC.RX_CONFIG.serialrx_provider)
                .push16(FC.RX_CONFIG.stick_max)
                .push16(FC.RX_CONFIG.stick_center)
                .push16(FC.RX_CONFIG.stick_min)
                .push8(FC.RX_CONFIG.spektrum_sat_bind)
                .push16(FC.RX_CONFIG.rx_min_usec)
                .push16(FC.RX_CONFIG.rx_max_usec);
            if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
                buffer.push8(FC.RX_CONFIG.rcInterpolation)
                    .push8(FC.RX_CONFIG.rcInterpolationInterval)
                    .push16(FC.RX_CONFIG.airModeActivateThreshold);
                if (semver.gte(FC.CONFIG.apiVersion, "1.31.0")) {
                    buffer.push8(FC.RX_CONFIG.rxSpiProtocol)
                        .push32(FC.RX_CONFIG.rxSpiId)
                        .push8(FC.RX_CONFIG.rxSpiRfChannelCount)
                        .push8(FC.RX_CONFIG.fpvCamAngleDegrees);
                    if (semver.gte(FC.CONFIG.apiVersion, "1.40.0")) {
                        buffer.push8(FC.RX_CONFIG.rcInterpolationChannels)
                            .push8(FC.RX_CONFIG.rcSmoothingType)
                            .push8(FC.RX_CONFIG.rcSmoothingInputCutoff)
                            .push8(FC.RX_CONFIG.rcSmoothingDerivativeCutoff)
                            .push8(FC.RX_CONFIG.rcSmoothingInputType)
                            .push8(FC.RX_CONFIG.rcSmoothingDerivativeType);
                        if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                            buffer.push8(FC.RX_CONFIG.usbCdcHidType)
                                  .push8(FC.RX_CONFIG.rcSmoothingAutoSmoothness);
                        }
                    }
                }
            }

            break;

        case MSPCodes.MSP_SET_FAILSAFE_CONFIG:
            buffer.push8(FC.FAILSAFE_CONFIG.failsafe_delay)
                .push8(FC.FAILSAFE_CONFIG.failsafe_off_delay)
                .push16(FC.FAILSAFE_CONFIG.failsafe_throttle);
            if (semver.gte(FC.CONFIG.apiVersion, "1.15.0")) {
                buffer.push8(FC.FAILSAFE_CONFIG.failsafe_switch_mode)
                    .push16(FC.FAILSAFE_CONFIG.failsafe_throttle_low_delay)
                    .push8(FC.FAILSAFE_CONFIG.failsafe_procedure);
            }
            break;

        case MSPCodes.MSP_SET_TRANSPONDER_CONFIG:
            if (semver.gte(FC.CONFIG.apiVersion, "1.33.0")) {
                buffer.push8(FC.TRANSPONDER.provider); //
            }
            for (let i = 0; i < FC.TRANSPONDER.data.length; i++) {
                buffer.push8(FC.TRANSPONDER.data[i]);
            }
            break;

        case MSPCodes.MSP_SET_CHANNEL_FORWARDING:
            for (let i = 0; i < FC.SERVO_CONFIG.length; i++) {
                var out = FC.SERVO_CONFIG[i].indexOfChannelToForward;
                if (out == undefined) {
                    out = 255; // Cleanflight defines "CHANNEL_FORWARDING_DISABLED" as "(uint8_t)0xFF"
                }
                buffer.push8(out);
            }
            break;
        case MSPCodes.MSP_SET_CF_SERIAL_CONFIG:
            if (semver.lt(FC.CONFIG.apiVersion, "1.6.0")) {

                for (let i = 0; i < FC.SERIAL_CONFIG.ports.length; i++) {
                    buffer.push8(FC.SERIAL_CONFIG.ports[i].scenario);
                }
                buffer.push32(FC.SERIAL_CONFIG.mspBaudRate)
                    .push32(FC.SERIAL_CONFIG.cliBaudRate)
                    .push32(FC.SERIAL_CONFIG.gpsBaudRate)
                    .push32(FC.SERIAL_CONFIG.gpsPassthroughBaudRate);
            } else {
                for (let i = 0; i < FC.SERIAL_CONFIG.ports.length; i++) {
                    const serialPort = FC.SERIAL_CONFIG.ports[i];

                    buffer.push8(serialPort.identifier);

                    const functionMask = self.serialPortFunctionsToMask(serialPort.functions);
                    buffer.push16(functionMask)
                        .push8(self.BAUD_RATES.indexOf(serialPort.msp_baudrate))
                        .push8(self.BAUD_RATES.indexOf(serialPort.gps_baudrate))
                        .push8(self.BAUD_RATES.indexOf(serialPort.telemetry_baudrate))
                        .push8(self.BAUD_RATES.indexOf(serialPort.blackbox_baudrate));
                }
            }
            break;

        case MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG:
            buffer.push8(FC.SERIAL_CONFIG.ports.length);

            for (let i = 0; i < FC.SERIAL_CONFIG.ports.length; i++) {
                const serialPort = FC.SERIAL_CONFIG.ports[i];

                buffer.push8(serialPort.identifier);

                const functionMask = self.serialPortFunctionsToMask(serialPort.functions);
                buffer.push32(functionMask)
                    .push8(self.BAUD_RATES.indexOf(serialPort.msp_baudrate))
                    .push8(self.BAUD_RATES.indexOf(serialPort.gps_baudrate))
                    .push8(self.BAUD_RATES.indexOf(serialPort.telemetry_baudrate))
                    .push8(self.BAUD_RATES.indexOf(serialPort.blackbox_baudrate));
            }
            break;

        case MSPCodes.MSP_SET_MOTOR_3D_CONFIG:
            buffer.push16(FC.MOTOR_3D_CONFIG.deadband3d_low)
                .push16(FC.MOTOR_3D_CONFIG.deadband3d_high)
                .push16(FC.MOTOR_3D_CONFIG.neutral);
            if (semver.lt(FC.CONFIG.apiVersion, "1.17.0")) {
                buffer.push16(FC.RC_DEADBAND_CONFIG.deadband3d_throttle);
            }
            break;

        case MSPCodes.MSP_SET_RC_DEADBAND:
            buffer.push8(FC.RC_DEADBAND_CONFIG.deadband)
                .push8(FC.RC_DEADBAND_CONFIG.yaw_deadband)
                .push8(FC.RC_DEADBAND_CONFIG.alt_hold_deadband);
            if (semver.gte(FC.CONFIG.apiVersion, "1.17.0")) {
                buffer.push16(FC.RC_DEADBAND_CONFIG.deadband3d_throttle);
            }
            break;

        case MSPCodes.MSP_SET_SENSOR_ALIGNMENT:
            buffer.push8(FC.SENSOR_ALIGNMENT.align_gyro)
                .push8(FC.SENSOR_ALIGNMENT.align_acc)
                .push8(FC.SENSOR_ALIGNMENT.align_mag);
            if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                buffer.push8(FC.SENSOR_ALIGNMENT.gyro_to_use)
                .push8(FC.SENSOR_ALIGNMENT.gyro_1_align)
                .push8(FC.SENSOR_ALIGNMENT.gyro_2_align);
            }
            break;
        case MSPCodes.MSP_SET_ADVANCED_CONFIG:
            buffer.push8(FC.PID_ADVANCED_CONFIG.gyro_sync_denom)
                .push8(FC.PID_ADVANCED_CONFIG.pid_process_denom)
                .push8(FC.PID_ADVANCED_CONFIG.use_unsyncedPwm)
                .push8(self.reorderPwmProtocols(FC.PID_ADVANCED_CONFIG.fast_pwm_protocol))
                .push16(FC.PID_ADVANCED_CONFIG.motor_pwm_rate);
            if (semver.gte(FC.CONFIG.apiVersion, "1.24.0")) {
                buffer.push16(FC.PID_ADVANCED_CONFIG.digitalIdlePercent * 100);

                if (semver.gte(FC.CONFIG.apiVersion, "1.25.0")) {
                    let gyroUse32kHz = 0;
                    if (semver.lt(FC.CONFIG.apiVersion, "1.41.0")) {
                        gyroUse32kHz = FC.PID_ADVANCED_CONFIG.gyroUse32kHz;
                    }
                    buffer.push8(gyroUse32kHz);
                    if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                        buffer.push8(FC.PID_ADVANCED_CONFIG.motorPwmInversion)
                              .push8(FC.SENSOR_ALIGNMENT.gyro_to_use) // We don't want to double up on storing this state
                              .push8(FC.PID_ADVANCED_CONFIG.gyroHighFsr)
                              .push8(FC.PID_ADVANCED_CONFIG.gyroMovementCalibThreshold)
                              .push16(FC.PID_ADVANCED_CONFIG.gyroCalibDuration)
                              .push16(FC.PID_ADVANCED_CONFIG.gyroOffsetYaw)
                              .push8(FC.PID_ADVANCED_CONFIG.gyroCheckOverflow)
                              .push8(FC.PID_ADVANCED_CONFIG.debugMode);
                    }
                }
            }
            break;
        case MSPCodes.MSP_SET_FILTER_CONFIG:
            buffer.push8(FC.FILTER_CONFIG.gyro_lowpass_hz)
                .push16(FC.FILTER_CONFIG.dterm_lowpass_hz)
                .push16(FC.FILTER_CONFIG.yaw_lowpass_hz);
            if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
                buffer.push16(FC.FILTER_CONFIG.gyro_notch_hz)
                    .push16(FC.FILTER_CONFIG.gyro_notch_cutoff)
                    .push16(FC.FILTER_CONFIG.dterm_notch_hz)
                    .push16(FC.FILTER_CONFIG.dterm_notch_cutoff);
                if (semver.gte(FC.CONFIG.apiVersion, "1.21.0")) {
                    buffer.push16(FC.FILTER_CONFIG.gyro_notch2_hz)
                        .push16(FC.FILTER_CONFIG.gyro_notch2_cutoff)
                }
                if (semver.gte(FC.CONFIG.apiVersion, "1.36.0")) {
                    buffer.push8(FC.FILTER_CONFIG.dterm_lowpass_type);
                }
                if (semver.gte(FC.CONFIG.apiVersion, "1.39.0")) {
                    let gyro_32khz_hardware_lpf = 0;
                    if (semver.lt(FC.CONFIG.apiVersion, "1.41.0")) {
                        gyro_32khz_hardware_lpf = FC.FILTER_CONFIG.gyro_32khz_hardware_lpf;
                    }
                    buffer.push8(FC.FILTER_CONFIG.gyro_hardware_lpf)
                          .push8(gyro_32khz_hardware_lpf)
                          .push16(FC.FILTER_CONFIG.gyro_lowpass_hz)
                          .push16(FC.FILTER_CONFIG.gyro_lowpass2_hz)
                          .push8(FC.FILTER_CONFIG.gyro_lowpass_type)
                          .push8(FC.FILTER_CONFIG.gyro_lowpass2_type)
                          .push16(FC.FILTER_CONFIG.dterm_lowpass2_hz);
                }
                if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                    buffer.push8(FC.FILTER_CONFIG.dterm_lowpass2_type)
                          .push16(FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz)
                          .push16(FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz)
                          .push16(FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz)
                          .push16(FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz);
                }
                if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                    buffer.push8(FC.FILTER_CONFIG.dyn_notch_range)
                          .push8(FC.FILTER_CONFIG.dyn_notch_width_percent)
                          .push16(FC.FILTER_CONFIG.dyn_notch_q)
                          .push16(FC.FILTER_CONFIG.dyn_notch_min_hz)
                          .push8(FC.FILTER_CONFIG.gyro_rpm_notch_harmonics)
                          .push8(FC.FILTER_CONFIG.gyro_rpm_notch_min_hz);
                }
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                    buffer.push16(FC.FILTER_CONFIG.dyn_notch_max_hz);
                }
                if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                    buffer.push8(FC.FILTER_CONFIG.dyn_lpf_curve_expo);
                }
            }
            break;
        case MSPCodes.MSP_SET_PID_ADVANCED:
            if (semver.gte(FC.CONFIG.apiVersion, "1.20.0")) {
                buffer.push16(FC.ADVANCED_TUNING.rollPitchItermIgnoreRate)
                    .push16(FC.ADVANCED_TUNING.yawItermIgnoreRate)
                    .push16(FC.ADVANCED_TUNING.yaw_p_limit)
                    .push8(FC.ADVANCED_TUNING.deltaMethod)
                    .push8(FC.ADVANCED_TUNING.vbatPidCompensation);

                if (semver.gte(FC.CONFIG.apiVersion, "1.40.0")) {
                    buffer.push8(FC.ADVANCED_TUNING.feedforwardTransition);
                } else {
                    buffer.push8(FC.ADVANCED_TUNING.dtermSetpointTransition);
                }

                buffer.push8(Math.min(FC.ADVANCED_TUNING.dtermSetpointWeight, 254))
                      .push8(FC.ADVANCED_TUNING.toleranceBand)
                      .push8(FC.ADVANCED_TUNING.toleranceBandReduction)
                      .push8(FC.ADVANCED_TUNING.itermThrottleGain)
                      .push16(FC.ADVANCED_TUNING.pidMaxVelocity)
                      .push16(FC.ADVANCED_TUNING.pidMaxVelocityYaw);

                if (semver.gte(FC.CONFIG.apiVersion, "1.24.0")) {
                    buffer.push8(FC.ADVANCED_TUNING.levelAngleLimit)
                        .push8(FC.ADVANCED_TUNING.levelSensitivity);

                    if (semver.gte(FC.CONFIG.apiVersion, "1.36.0")) {
                        buffer.push16(FC.ADVANCED_TUNING.itermThrottleThreshold)
                            .push16(FC.ADVANCED_TUNING.itermAcceleratorGain);

                        if (semver.gte(FC.CONFIG.apiVersion, "1.39.0")) {
                            buffer.push16(FC.ADVANCED_TUNING.dtermSetpointWeight);

                            if (semver.gte(FC.CONFIG.apiVersion, "1.40.0")) {
                                buffer.push8(FC.ADVANCED_TUNING.itermRotation)
                                      .push8(FC.ADVANCED_TUNING.smartFeedforward)
                                      .push8(FC.ADVANCED_TUNING.itermRelax)
                                      .push8(FC.ADVANCED_TUNING.itermRelaxType)
                                      .push8(FC.ADVANCED_TUNING.absoluteControlGain)
                                      .push8(FC.ADVANCED_TUNING.throttleBoost)
                                      .push8(FC.ADVANCED_TUNING.acroTrainerAngleLimit)
                                      .push16(FC.ADVANCED_TUNING.feedforwardRoll)
                                      .push16(FC.ADVANCED_TUNING.feedforwardPitch)
                                      .push16(FC.ADVANCED_TUNING.feedforwardYaw)
                                      .push8(FC.ADVANCED_TUNING.antiGravityMode);

                                if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                                    buffer.push8(FC.ADVANCED_TUNING.dMinRoll)
                                          .push8(FC.ADVANCED_TUNING.dMinPitch)
                                          .push8(FC.ADVANCED_TUNING.dMinYaw)
                                          .push8(FC.ADVANCED_TUNING.dMinGain)
                                          .push8(FC.ADVANCED_TUNING.dMinAdvance)
                                          .push8(FC.ADVANCED_TUNING.useIntegratedYaw)
                                          .push8(FC.ADVANCED_TUNING.integratedYawRelax);
                                          
                                    if(semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                                        buffer.push8(FC.ADVANCED_TUNING.itermRelaxCutoff);

                                        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
                                            buffer.push8(FC.ADVANCED_TUNING.motorOutputLimit)
                                                  .push8(FC.ADVANCED_TUNING.autoProfileCellCount)
                                                  .push8(FC.ADVANCED_TUNING.idleMinRpm);

                                            if(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                                                buffer.push8(FC.ADVANCED_TUNING.ff_interpolate_sp)
                                                      .push8(FC.ADVANCED_TUNING.ff_smooth_factor)
                                                      .push8(FC.ADVANCED_TUNING.ff_boost)
                                                      .push8(FC.ADVANCED_TUNING.vbat_sag_compensation);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // only supports 1 version pre bf 3.0
            else {
                buffer.push16(FC.ADVANCED_TUNING.rollPitchItermIgnoreRate)
                   .push16(FC.ADVANCED_TUNING.yawItermIgnoreRate)
                   .push16(FC.ADVANCED_TUNING.yaw_p_limit)
                   .push8(FC.ADVANCED_TUNING.deltaMethod)
                   .push8(FC.ADVANCED_TUNING.vbatPidCompensation);
            }
            break;
        case MSPCodes.MSP_SET_SENSOR_CONFIG:
            buffer.push8(FC.SENSOR_CONFIG.acc_hardware)
                .push8(FC.SENSOR_CONFIG.baro_hardware)
                .push8(FC.SENSOR_CONFIG.mag_hardware);
            break;

        case MSPCodes.MSP_SET_NAME:
            var MSP_BUFFER_SIZE = 64;
            for (let i = 0; i<FC.CONFIG.name.length && i<MSP_BUFFER_SIZE; i++) {
                buffer.push8(FC.CONFIG.name.charCodeAt(i));
            }
            break;

        case MSPCodes.MSP_SET_BLACKBOX_CONFIG:
            buffer.push8(FC.BLACKBOX.blackboxDevice)
                .push8(FC.BLACKBOX.blackboxRateNum)
                .push8(FC.BLACKBOX.blackboxRateDenom);
            if (semver.gte(FC.CONFIG.apiVersion, "1.36.0")) {
                buffer.push16(FC.BLACKBOX.blackboxPDenom);
            }
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
                buffer.push8(FC.BLACKBOX.blackboxSampleRate);
            }
            break;

        case MSPCodes.MSP_COPY_PROFILE:
            buffer.push8(FC.COPY_PROFILE.type)
                .push8(FC.COPY_PROFILE.dstProfile)
                .push8(FC.COPY_PROFILE.srcProfile);
            break;
        case MSPCodes.MSP_ARMING_DISABLE:
            var value;
            if (FC.CONFIG.armingDisabled) {
                value = 1;
            } else {
                value = 0;
            }
            buffer.push8(value);

            if (FC.CONFIG.runawayTakeoffPreventionDisabled) {
                value = 1;
            } else {
                value = 0;
            }
            // This will be ignored if `armingDisabled` is true
            buffer.push8(value);

            break;
        case MSPCodes.MSP_SET_RTC:
            var now = new Date();

            if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
                var timestamp = now.getTime();
                var secs = timestamp / 1000;
                var millis = timestamp % 1000;
                buffer.push32(secs);
                buffer.push16(millis);
            } else {
                buffer.push16(now.getUTCFullYear());
                buffer.push8(now.getUTCMonth() + 1);
                buffer.push8(now.getUTCDate());
                buffer.push8(now.getUTCHours());
                buffer.push8(now.getUTCMinutes());
                buffer.push8(now.getUTCSeconds());
            }

            break;

        case MSPCodes.MSP_SET_VTX_CONFIG:

            buffer.push16(FC.VTX_CONFIG.vtx_frequency)
                  .push8(FC.VTX_CONFIG.vtx_power)
                  .push8(FC.VTX_CONFIG.vtx_pit_mode ? 1 : 0)
                  .push8(FC.VTX_CONFIG.vtx_low_power_disarm);

            if (semver.gte(FC.CONFIG.apiVersion, "1.42.0")) {
                buffer.push16(FC.VTX_CONFIG.vtx_pit_mode_frequency)
                      .push8(FC.VTX_CONFIG.vtx_band)
                      .push8(FC.VTX_CONFIG.vtx_channel)
                      .push16(FC.VTX_CONFIG.vtx_frequency)
                      .push8(FC.VTX_CONFIG.vtx_table_bands)
                      .push8(FC.VTX_CONFIG.vtx_table_channels)
                      .push8(FC.VTX_CONFIG.vtx_table_powerlevels)
                      .push8(FC.VTX_CONFIG.vtx_table_clear ? 1 : 0);
            }

            break;

        case MSPCodes.MSP_SET_VTXTABLE_POWERLEVEL:

            buffer.push8(FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_number)
                  .push16(FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_value);

            buffer.push8(FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label.length);
            for (let i = 0; i < FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label.length; i++) {
                buffer.push8(FC.VTXTABLE_POWERLEVEL.vtxtable_powerlevel_label.charCodeAt(i));
            }

            break;

        case MSPCodes.MSP_SET_VTXTABLE_BAND:

            buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_number);

            buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_name.length);
            for (let i = 0; i < FC.VTXTABLE_BAND.vtxtable_band_name.length; i++) {
                buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_name.charCodeAt(i));
            }

            if (FC.VTXTABLE_BAND.vtxtable_band_letter != '') {
                buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_letter.charCodeAt(0))
            } else {
                buffer.push8(' '.charCodeAt(0));
            }
            buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_is_factory_band ? 1 : 0);

            buffer.push8(FC.VTXTABLE_BAND.vtxtable_band_frequencies.length);
            for (let i = 0; i < FC.VTXTABLE_BAND.vtxtable_band_frequencies.length; i++) {
                buffer.push16(FC.VTXTABLE_BAND.vtxtable_band_frequencies[i]);
            }

            break;

        case MSPCodes.MSP_MULTIPLE_MSP:

            while (FC.MULTIPLE_MSP.msp_commands.length > 0) {

                let mspCommand = FC.MULTIPLE_MSP.msp_commands.shift();

                self.mspMultipleCache.push(mspCommand);
                buffer.push8(mspCommand);
            }

            break;

        case MSPCodes.MSP_SET_MOTOR_OUTPUT_REORDERING:

            buffer.push8(FC.MOTOR_OUTPUT_ORDER.length);
            for (let i = 0; i < FC.MOTOR_OUTPUT_ORDER.length; i++) {
                buffer.push8(FC.MOTOR_OUTPUT_ORDER[i]);
            }

            break;

        default:
            return false;
    }

    return buffer;
};

/**
 * Set raw Rx values over MSP protocol.
 *
 * Channels is an array of 16-bit unsigned integer channel values to be sent. 8 channels is probably the maximum.
 */
MspHelper.prototype.setRawRx = function(channels) {
    var buffer = [];

    for (let i = 0; i < channels.length; i++) {
        buffer.push16(channels[i]);
    }

    MSP.send_message(MSPCodes.MSP_SET_RAW_RC, buffer, false);
}

/**
 * Send a request to read a block of data from the dataflash at the given address and pass that address and a dataview
 * of the returned data to the given callback (or null for the data if an error occured).
 */
MspHelper.prototype.dataflashRead = function(address, blockSize, onDataCallback) {
    var outData = [address & 0xFF, (address >> 8) & 0xFF, (address >> 16) & 0xFF, (address >> 24) & 0xFF];

    if (semver.gte(FC.CONFIG.apiVersion, "1.31.0")) {
        outData = outData.concat([blockSize & 0xFF, (blockSize >> 8) & 0xFF]);
    }

    if (semver.gte(FC.CONFIG.apiVersion, "1.36.0")) {
        // Allow compression
        outData = outData.concat([1]);
    }

    MSP.send_message(MSPCodes.MSP_DATAFLASH_READ, outData, false, function(response) {
        if (!response.crcError) {
            var chunkAddress = response.data.readU32();

            var headerSize = 4;
            var dataSize = response.data.buffer.byteLength - headerSize;
            var dataCompressionType = 0;
            if (semver.gte(FC.CONFIG.apiVersion, "1.31.0")) {
                headerSize = headerSize + 3;
                dataSize = response.data.readU16();
                dataCompressionType = response.data.readU8();
            }

            // Verify that the address of the memory returned matches what the caller asked for and there was not a CRC error
            if (chunkAddress == address) {
                /* Strip that address off the front of the reply and deliver it separately so the caller doesn't have to
                 * figure out the reply format:
                 */
                if (dataCompressionType == 0) {
                    onDataCallback(address, new DataView(response.data.buffer, response.data.byteOffset + headerSize, dataSize));
                } else if (dataCompressionType == 1) {
                    // Read compressed char count to avoid decoding stray bit sequences as bytes
                    var compressedCharCount = response.data.readU16();

                    // Compressed format uses 2 additional bytes as a pseudo-header to denote the number of uncompressed bytes
                    var compressedArray = new Uint8Array(response.data.buffer, response.data.byteOffset + headerSize + 2, dataSize - 2);
                    var decompressedArray = huffmanDecodeBuf(compressedArray, compressedCharCount, defaultHuffmanTree, defaultHuffmanLenIndex);

                    onDataCallback(address, new DataView(decompressedArray.buffer), dataSize);
                }
            } else {
                // Report address error
                console.log('Expected address ' + address + ' but received ' + chunkAddress + ' - retrying');
                onDataCallback(address, null);  // returning null to the callback forces a retry
            }
        } else {
            // Report crc error
            console.log('CRC error for address ' + address + ' - retrying');
            onDataCallback(address, null);  // returning null to the callback forces a retry
        }
    }, true);
};

MspHelper.prototype.sendServoConfigurations = function(onCompleteCallback) {
    var nextFunction = send_next_servo_configuration;

    var servoIndex = 0;

    if (FC.SERVO_CONFIG.length == 0) {
        onCompleteCallback();
    } else {
        nextFunction();
    }


    function send_next_servo_configuration() {

        var buffer = [];

        if (semver.lt(FC.CONFIG.apiVersion, "1.12.0")) {
            // send all in one go
            // 1.9.0 had a bug where the MSP input buffer was too small, limit to 8.
            for (let i = 0; i < FC.SERVO_CONFIG.length && i < 8; i++) {
                buffer.push16(FC.SERVO_CONFIG[i].min)
                    .push16(FC.SERVO_CONFIG[i].max)
                    .push16(FC.SERVO_CONFIG[i].middle)
                    .push8(FC.SERVO_CONFIG[i].rate);
            }
            nextFunction = send_channel_forwarding;
        } else {
            // send one at a time, with index

            var servoConfiguration = FC.SERVO_CONFIG[servoIndex];

            buffer.push8(servoIndex)
                .push16(servoConfiguration.min)
                .push16(servoConfiguration.max)
                .push16(servoConfiguration.middle)
                .push8(servoConfiguration.rate);

            if (semver.lt(FC.CONFIG.apiVersion, "1.33.0")) {
                buffer.push8(servoConfiguration.angleAtMin)
                    .push8(servoConfiguration.angleAtMax);
            }

            var out = servoConfiguration.indexOfChannelToForward;
            if (out == undefined) {
                out = 255; // Cleanflight defines "CHANNEL_FORWARDING_DISABLED" as "(uint8_t)0xFF"
            }
            buffer.push8(out)
                .push32(servoConfiguration.reversedInputSources);

            // prepare for next iteration
            servoIndex++;
            if (servoIndex == FC.SERVO_CONFIG.length) {
                nextFunction = onCompleteCallback;
            }
        }
        MSP.send_message(MSPCodes.MSP_SET_SERVO_CONFIGURATION, buffer, false, nextFunction);
    }

    function send_channel_forwarding() {
        var buffer = [];

        for (let i = 0; i < FC.SERVO_CONFIG.length; i++) {
            var out = FC.SERVO_CONFIG[i].indexOfChannelToForward;
            if (out == undefined) {
                out = 255; // Cleanflight defines "CHANNEL_FORWARDING_DISABLED" as "(uint8_t)0xFF"
            }
            buffer.push8(out);
        }

        nextFunction = onCompleteCallback;

        MSP.send_message(MSPCodes.MSP_SET_CHANNEL_FORWARDING, buffer, false, nextFunction);
    }
};

MspHelper.prototype.sendModeRanges = function(onCompleteCallback) {
    var nextFunction = send_next_mode_range;

    var modeRangeIndex = 0;

    if (FC.MODE_RANGES.length == 0) {
        onCompleteCallback();
    } else {
        send_next_mode_range();
    }

    function send_next_mode_range() {

        var modeRange = FC.MODE_RANGES[modeRangeIndex];

        var buffer = [];
        buffer.push8(modeRangeIndex)
            .push8(modeRange.id)
            .push8(modeRange.auxChannelIndex)
            .push8((modeRange.range.start - 900) / 25)
            .push8((modeRange.range.end - 900) / 25);

        if (semver.gte(FC.CONFIG.apiVersion, "1.41.0")) {
            var modeRangeExtra = FC.MODE_RANGES_EXTRA[modeRangeIndex];
            
            buffer.push8(modeRangeExtra.modeLogic)
                .push8(modeRangeExtra.linkedTo);
        }

        // prepare for next iteration
        modeRangeIndex++;
        if (modeRangeIndex == FC.MODE_RANGES.length) {
            nextFunction = onCompleteCallback;
        }
        MSP.send_message(MSPCodes.MSP_SET_MODE_RANGE, buffer, false, nextFunction);
    }
};

MspHelper.prototype.sendAdjustmentRanges = function(onCompleteCallback) {
    var nextFunction = send_next_adjustment_range;

    var adjustmentRangeIndex = 0;

    if (FC.ADJUSTMENT_RANGES.length == 0) {
        onCompleteCallback();
    } else {
        send_next_adjustment_range();
    }


    function send_next_adjustment_range() {

        var adjustmentRange = FC.ADJUSTMENT_RANGES[adjustmentRangeIndex];

        var buffer = [];
        buffer.push8(adjustmentRangeIndex)
            .push8(adjustmentRange.slotIndex)
            .push8(adjustmentRange.auxChannelIndex)
            .push8((adjustmentRange.range.start - 900) / 25)
            .push8((adjustmentRange.range.end - 900) / 25)
            .push8(adjustmentRange.adjustmentFunction)
            .push8(adjustmentRange.auxSwitchChannelIndex);

        // prepare for next iteration
        adjustmentRangeIndex++;
        if (adjustmentRangeIndex == FC.ADJUSTMENT_RANGES.length) {
            nextFunction = onCompleteCallback;

        }
        MSP.send_message(MSPCodes.MSP_SET_ADJUSTMENT_RANGE, buffer, false, nextFunction);
    }
};

MspHelper.prototype.sendVoltageConfig = function(onCompleteCallback) {

    var nextFunction = send_next_voltage_config;

    var configIndex = 0;
    
    if (FC.VOLTAGE_METER_CONFIGS.length == 0) {
        onCompleteCallback();
    } else {
        send_next_voltage_config();
    }

    function send_next_voltage_config() {
        var buffer = [];

        buffer.push8(FC.VOLTAGE_METER_CONFIGS[configIndex].id)
            .push8(FC.VOLTAGE_METER_CONFIGS[configIndex].vbatscale)
            .push8(FC.VOLTAGE_METER_CONFIGS[configIndex].vbatresdivval)
            .push8(FC.VOLTAGE_METER_CONFIGS[configIndex].vbatresdivmultiplier);

        // prepare for next iteration
        configIndex++;
        if (configIndex == FC.VOLTAGE_METER_CONFIGS.length) {
            nextFunction = onCompleteCallback;
        }

        MSP.send_message(MSPCodes.MSP_SET_VOLTAGE_METER_CONFIG, buffer, false, nextFunction);
    }

}

MspHelper.prototype.sendCurrentConfig = function(onCompleteCallback) {

    var nextFunction = send_next_current_config;

    var configIndex = 0;
    
    if (FC.CURRENT_METER_CONFIGS.length == 0) {
        onCompleteCallback();
    } else {
        send_next_current_config();
    }

    function send_next_current_config() {
        var buffer = [];

        buffer.push8(FC.CURRENT_METER_CONFIGS[configIndex].id)
            .push16(FC.CURRENT_METER_CONFIGS[configIndex].scale)
            .push16(FC.CURRENT_METER_CONFIGS[configIndex].offset);

        // prepare for next iteration
        configIndex++;
        if (configIndex == FC.CURRENT_METER_CONFIGS.length) {
            nextFunction = onCompleteCallback;
        }

        MSP.send_message(MSPCodes.MSP_SET_CURRENT_METER_CONFIG, buffer, false, nextFunction);
    }

}

MspHelper.prototype.sendLedStripConfig = function(onCompleteCallback) {

    var nextFunction = send_next_led_strip_config;

    var ledIndex = 0;

    if (FC.LED_STRIP.length == 0) {
        onCompleteCallback();
    } else {
        send_next_led_strip_config();
    }

    function send_next_led_strip_config() {

        var led = FC.LED_STRIP[ledIndex];
        var ledDirectionLetters =        ['n', 'e', 's', 'w', 'u', 'd'];      // in LSB bit order
        var ledFunctionLetters =         ['i', 'w', 'f', 'a', 't', 'r', 'c', 'g', 's', 'b', 'l']; // in LSB bit order
        var ledBaseFunctionLetters =     ['c', 'f', 'a', 'l', 's', 'g', 'r']; // in LSB bit
        if (semver.lt(FC.CONFIG.apiVersion, "1.36.0")) {
            var ledOverlayLetters =      ['t', 'o', 'b', 'w', 'i', 'w']; // in LSB bit
        } else {
            var ledOverlayLetters =      ['t', 'o', 'b', 'v', 'i', 'w']; // in LSB bit
        }

        var buffer = [];

        buffer.push(ledIndex);

        if (semver.lt(FC.CONFIG.apiVersion, "1.20.0")) {
            var directionMask = 0;
            for (var directionLetterIndex = 0; directionLetterIndex < led.directions.length; directionLetterIndex++) {
                var bitIndex = ledDirectionLetters.indexOf(led.directions[directionLetterIndex]);
                if (bitIndex >= 0) {
                    directionMask = bit_set(directionMask, bitIndex);
                }
            }
            buffer.push16(directionMask);

            let functionMask = 0;
            for (var functionLetterIndex = 0; functionLetterIndex < led.functions.length; functionLetterIndex++) {
                var bitIndex = ledFunctionLetters.indexOf(led.functions[functionLetterIndex]);
                if (bitIndex >= 0) {
                    functionMask = bit_set(functionMask, bitIndex);
                }
            }
            buffer.push16(functionMask)

                .push8(led.x)
                .push8(led.y)

                .push8(led.color);
        } else {
            var mask = 0;

            mask |= (led.y << 0);
            mask |= (led.x << 4);

            for (var functionLetterIndex = 0; functionLetterIndex < led.functions.length; functionLetterIndex++) {
                var fnIndex = ledBaseFunctionLetters.indexOf(led.functions[functionLetterIndex]);
                if (fnIndex >= 0) {
                    mask |= (fnIndex << 8);
                    break;
                }
            }

            for (var overlayLetterIndex = 0; overlayLetterIndex < led.functions.length; overlayLetterIndex++) {
                var bitIndex = ledOverlayLetters.indexOf(led.functions[overlayLetterIndex]);
                if (bitIndex >= 0) {
                    mask |= bit_set(mask, bitIndex + 12);
                }
            }

            mask |= (led.color << 18);

            for (var directionLetterIndex = 0; directionLetterIndex < led.directions.length; directionLetterIndex++) {
                var bitIndex = ledDirectionLetters.indexOf(led.directions[directionLetterIndex]);
                if (bitIndex >= 0) {
                    mask |= bit_set(mask, bitIndex + 22);
                }
            }

            mask |= (0 << 28); // parameters


            buffer.push32(mask);
        }

        // prepare for next iteration
        ledIndex++;
        if (ledIndex == FC.LED_STRIP.length) {
            nextFunction = onCompleteCallback;
        }

        MSP.send_message(MSPCodes.MSP_SET_LED_STRIP_CONFIG, buffer, false, nextFunction);
    }
}

MspHelper.prototype.sendLedStripColors = function(onCompleteCallback) {
    if (FC.LED_COLORS.length == 0) {
        onCompleteCallback();
    } else {
        var buffer = [];

        for (var colorIndex = 0; colorIndex < FC.LED_COLORS.length; colorIndex++) {
            var color = FC.LED_COLORS[colorIndex];

            buffer.push16(color.h)
                .push8(color.s)
                .push8(color.v);
        }
        MSP.send_message(MSPCodes.MSP_SET_LED_COLORS, buffer, false, onCompleteCallback);
    }
}

MspHelper.prototype.sendLedStripModeColors = function(onCompleteCallback) {

    var nextFunction = send_next_led_strip_mode_color;
    var index = 0;

    if (FC.LED_MODE_COLORS.length == 0) {
        onCompleteCallback();
    } else {
        send_next_led_strip_mode_color();
    }

    function send_next_led_strip_mode_color() {
        var buffer = [];

        var mode_color = FC.LED_MODE_COLORS[index];

        buffer.push8(mode_color.mode)
            .push8(mode_color.direction)
            .push8(mode_color.color);

        // prepare for next iteration
        index++;
        if (index == FC.LED_MODE_COLORS.length) {
            nextFunction = onCompleteCallback;
        }

        MSP.send_message(MSPCodes.MSP_SET_LED_STRIP_MODECOLOR, buffer, false, nextFunction);
    }
}

MspHelper.prototype.serialPortFunctionMaskToFunctions = function(functionMask) {
    var self = this;
    var functions = [];

    var keys = Object.keys(self.SERIAL_PORT_FUNCTIONS);
    for (var index = 0; index < keys.length; index++) {
        var key = keys[index];
        var bit = self.SERIAL_PORT_FUNCTIONS[key];
        if (bit_check(functionMask, bit)) {
            functions.push(key);
        }
    }
    return functions;
}

MspHelper.prototype.serialPortFunctionsToMask = function(functions) {
    var self = this;
    var mask = 0;

    var keys = Object.keys(self.SERIAL_PORT_FUNCTIONS);
    for (var index = 0; index < functions.length; index++) {
        var key = functions[index];
        var bitIndex = self.SERIAL_PORT_FUNCTIONS[key];
        if (bitIndex >= 0) {
            mask = bit_set(mask, bitIndex);
        }
    }
    return mask;
}

MspHelper.prototype.sendRxFailConfig = function(onCompleteCallback) {
    var nextFunction = send_next_rxfail_config;

    var rxFailIndex = 0;

    if (FC.RXFAIL_CONFIG.length == 0) {
        onCompleteCallback();
    } else {
        send_next_rxfail_config();
    }

    function send_next_rxfail_config() {

        var rxFail = FC.RXFAIL_CONFIG[rxFailIndex];

        var buffer = [];
        buffer.push8(rxFailIndex)
            .push8(rxFail.mode)
            .push16(rxFail.value);


        // prepare for next iteration
        rxFailIndex++;
        if (rxFailIndex == FC.RXFAIL_CONFIG.length) {
            nextFunction = onCompleteCallback;

        }
        MSP.send_message(MSPCodes.MSP_SET_RXFAIL_CONFIG, buffer, false, nextFunction);
    }
}

MspHelper.prototype.setArmingEnabled = function(doEnable, disableRunawayTakeoffPrevention, onCompleteCallback) {
    if (semver.gte(FC.CONFIG.apiVersion, "1.37.0") && (FC.CONFIG.armingDisabled === doEnable || FC.CONFIG.runawayTakeoffPreventionDisabled !== disableRunawayTakeoffPrevention)) {
        FC.CONFIG.armingDisabled = !doEnable;
        FC.CONFIG.runawayTakeoffPreventionDisabled = disableRunawayTakeoffPrevention;

        MSP.send_message(MSPCodes.MSP_ARMING_DISABLE, mspHelper.crunch(MSPCodes.MSP_ARMING_DISABLE), false, function () {
            if (doEnable) {
                GUI.log(i18n.getMessage('armingEnabled'));
                if (disableRunawayTakeoffPrevention) {
                    GUI.log(i18n.getMessage('runawayTakeoffPreventionDisabled'));
                } else {
                    GUI.log(i18n.getMessage('runawayTakeoffPreventionEnabled'));
                }
            } else {
                GUI.log(i18n.getMessage('armingDisabled'));
            }

            if (onCompleteCallback) {
                onCompleteCallback();
            }
        });
    } else {
        if (onCompleteCallback) {
            onCompleteCallback();
        }
    }
}

MspHelper.prototype.loadSerialConfig = function(callback) {
    const mspCode = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43) ? MSPCodes.MSP2_COMMON_SERIAL_CONFIG : MSPCodes.MSP_CF_SERIAL_CONFIG;
    MSP.send_message(mspCode, false, false, callback);
};

MspHelper.prototype.sendSerialConfig = function(callback) {
    const mspCode = semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43) ? MSPCodes.MSP2_COMMON_SET_SERIAL_CONFIG : MSPCodes.MSP_SET_CF_SERIAL_CONFIG;
    MSP.send_message(mspCode, mspHelper.crunch(mspCode), false, callback);
};

MSP.SDCARD_STATE_NOT_PRESENT = 0; //TODO, move these to better place
MSP.SDCARD_STATE_FATAL       = 1;
MSP.SDCARD_STATE_CARD_INIT   = 2;
MSP.SDCARD_STATE_FS_INIT     = 3;
MSP.SDCARD_STATE_READY       = 4;
