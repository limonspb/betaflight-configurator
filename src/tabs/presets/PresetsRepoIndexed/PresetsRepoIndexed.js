'use strict';

class PresetsRepoIndexed
{
    constructor(urlRaw, urlGithub)
    {
        this._urlRaw = urlRaw;
        this._urlGithub = urlGithub;
        this._index = null;
    }

    get index()
    {
        return this._index;
    }

    loadIndex()
    {
        return fetch(this._urlRaw + "index.json")
            .then(res => res.json())
            .then((out) => {
                this._index = out;
            });
    }

    removeUncheckedOptions(text, checkedOptions)
    {
        let strings = text.split("\n");
        let resultStrings = [];
        let isCurrentOptionExcluded = false;
        const lowerCasedCheckedOptions = checkedOptions.map(optionName => optionName.toLowerCase());

        strings.forEach(str => {
            if (this._isLineCommented(str)) {
                let line = this._removeCommentDirective(str);

                if (this._isOptionBegin(line)) {
                    const optionNameLowCase = this._getOptionName(line).toLowerCase();

                    if (!lowerCasedCheckedOptions.includes(optionNameLowCase)) {
                        isCurrentOptionExcluded = true;
                    }
                } else if (this._isOptionEnd(line)) {
                    isCurrentOptionExcluded = false;
                }
            } else if (!isCurrentOptionExcluded) {
                resultStrings.push(str);
            }
        });

        return resultStrings.join('\n');
    }

    _isLineCommented(line)
    {
        return line.trim().startsWith(PresetsRepoIndexed._sCliCommentDirective);
    }

    _isOptionBegin(line)
    {
        const lowCaseLine = line.toLowerCase();
        return lowCaseLine.startsWith(this._index.settings.OptionDirectives.BEGIN_OPTION_DIRECTIVE);
    }

    _isOptionEnd(line)
    {
        const lowCaseLine = line.toLowerCase();
        return lowCaseLine.startsWith(this._index.settings.OptionDirectives.END_OPTION_DIRECTIVE);
    }

    _getOptionName(line)
    {
        const directiveRemoved = line.slice(this._index.settings.OptionDirectives.BEGIN_OPTION_DIRECTIVE.length).trim();
        const regExpRemoveChecked = new RegExp(this._escapeRegex(this._index.settings.OptionDirectives.OPTION_CHECKED), 'gi');
        const regExpRemoveUnchecked = new RegExp(this._escapeRegex(this._index.settings.OptionDirectives.OPTION_UNCHECKED), 'gi');
        let optionName = directiveRemoved.replace(regExpRemoveChecked, "");
        optionName = optionName.replace(regExpRemoveUnchecked, "").trim();
        return optionName;
    }

    _escapeRegex(string)
    {
        return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    _removeCommentDirective(line)
    {
        return line.trim().slice(1).trim();
    }

    getPresetGitHubLink(preset)
    {
        return this._urlGithub + preset.fullPath;
    }


    _parceInclude(strings, includeRowIndexes, promises)
    {
        const regExpInclude = /^#[ ]+?include:[ ]+?(?<filePath>\S+$)/;
        // Reg exp extracts file/path.txt from # include: file/path.txt

        for (let i = 0; i < strings.length; i++) {
            const match = regExpInclude.exec(strings[i]);

            if (match !== null) {
                includeRowIndexes.push(i);
                const filePath = this._urlRaw + match.groups.filePath;
                const promise = this._loadPresetText(filePath);
                promises.push(promise);
            }
        }
    }

    _executeIncludeOnce(strings)
    {
        const includeRowIndexes = []; // row indexes with "#include" statements
        const promises = []; // promises to load included files
        this._parceInclude(strings, includeRowIndexes, promises);

        let resultPromise = new Promise((resolve, reject) => {
            Promise.all(promises)
            .then((includedTexts) => {
                for (let i = 0; i < includedTexts.length; i++)
                {
                    strings[includeRowIndexes[i]] = includedTexts[i];
                }

                resolve(strings.join('\n'));
            })
            .catch((err) => {
                reject(err);
            });
        });

        return resultPromise;
    }

    loadPreset(preset)
    {
        const promiseMainText = this._loadPresetText(this._urlRaw + preset.fullPath);

        let resultPromise = new Promise((resolve, reject) => {
            promiseMainText
            .then((text) => {
                let strings = text.split("\n");
                strings = strings.map(str => str.trim());
                this._executeIncludeOnce(strings).then(finalText => {
                    resolve(finalText);
                }).
                catch(err => {
                    reject(err);
                });
            })
            .catch((err) => {
                reject(err);
            });
        });

        return resultPromise;
    }

    _loadPresetText(fullUrl)
    {
        let resultPromise = new Promise((resolve, reject) => {
            fetch(fullUrl).then(res => res.text()).then(text => {
                resolve(text);
            })
            .catch(err => {
                console.error(err);
                reject(err);
            });
        });

        return resultPromise;
    }
}

PresetsRepoIndexed._sCliCommentDirective = "#";
