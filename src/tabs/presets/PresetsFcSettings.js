'use strict';

class PresetsFcSettings {
    constructor()
    {
        this.clear();
    }

    clear()
    {
        this._dumpValues = {};
        this._dumpCommands = [];
    }

    addLine(line)
    {
        const command = line.trim();

        if (command !== "") {
            if (command.startsWith("set ")) {
                this._addSetCommand(command);
            } else {
                this._addNonSetCommand(command);
            }
        }

        console.log(this);
    }

    _addSetCommand(command)
    {
        const commandSetRemoved = command.substring(4).trim();
        const splitted = commandSetRemoved.split('=');
        const varName = splitted[0].trim();
        const varValue = splitted[1].trim();
        this._dumpValues[varName] = varValue;
    }

    _addNonSetCommand(command)
    {
        this._dumpCommands.push(command);
    }
}
