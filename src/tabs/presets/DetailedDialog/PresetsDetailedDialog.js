'use strict';

class PresetsDetailedDialog
{
    constructor(domDialog, cliEngine)
    {
        this._domDialog = domDialog;
        this._cliEngine = cliEngine;
    }

    load(onLoadedCallback)
    {
        this._onLoadedCallback = onLoadedCallback;
        this._domDialog.load("./tabs/presets/DetailedDialog/PresetsDetailedDialog.html", () =>
        {
            this._setupdialog();
        });
    }

    open(preset, presetsRepo)
    {
        this._presetsRepo = presetsRepo;
        this._preset = preset;
        this._updatePresetUi();
        this._domDialog[0].showModal();
    }

    _updatePresetUi()
    {
        this._domDescription.html(this._preset.description?.join("<br/>"));

        this._domGitHubLink.attr("href", this._presetsRepo.getPresetGitHubLink(this._preset));
        this._titlePanel.empty();
        const presetPanel = new PresetTitlePanel(this._titlePanel, this._preset, false, ()=>{ this._setLoadingState(false); });
        this._loadRegionsSelect();
        this._setLoadingState(false);
    }

    _setLoadingState(isLoading)
    {
        this._domProperties.toggle(!isLoading);
        this._domLoading.toggle(isLoading);
        this._domButtonApply.toggle(!isLoading);
        this._domError.toggle(false);
    }

    _showError(msg)
    {
        this._domError.toggle(true);
        this._domError.text(msg);
        this._domProperties.toggle(false);
        this._domLoading.toggle(false);
        this._domButtonApply.toggle(false);
    }

    _readDom()
    {
        this._domButtonApply = $('#presets_detailed_dialog_applybtn');
        this._domButtonCancel = $('#presets_detailed_dialog_closebtn');
        this._domLoading = $('#presets_detailed_dialog_loading');
        this._domError = $('#presets_detailed_dialog_error');
        this._domProperties = $('#presets_detailed_dialog_properties');
        this._titlePanel = $('.preset_detailed_dialog_title_panel');
        this._domDescription = this._domDialog.find('.preset_detailed_dialog_description');
        this._domGitHubLink = this._domDialog.find('#presets_github_link');
        this._domRegionsSelect = $('#presets_regions_select');
        this._domRegionsSelectPanel = $('#presets_regions_panel');
    }

    _createRegionsSelect(regions)
    {
        regions.forEach(region => {
            let selectedString = "selected=\"selected\"";
            if (!region.checked) {
                selectedString = "";
            }

            this._domRegionsSelect.append(`<option value= ${region.name} ${selectedString}>${region.name}</option>`);
        });

        this._domRegionsSelect.multipleSelect({
            placeholder: i18n.getMessage("dropDownAll"),
            formatSelectAll () { return i18n.getMessage("dropDownSelectAll"); },
            formatAllSelected() { return i18n.getMessage("dropDownAll"); },
        });
    }

    _destroyRegionsSelect()
    {
        this._domRegionsSelect.multipleSelect('destroy');
    }

    _loadRegionsSelect()
    {

        const regionsVisible = 0 !== this._preset.regions.length;
        this._domRegionsSelect.empty();
        this._domRegionsSelectPanel.toggle(regionsVisible);

        if (regionsVisible) {
            this._createRegionsSelect(this._preset.regions);
        }

        this._domRegionsSelect.multipleSelect('refresh');
    }

    _setupdialog()
    {
        i18n.localizePage();
        this._readDom();

        this._domButtonApply.on("click", () =>
        {
            this._onApplyButtonClicked();
        });
        this._domButtonCancel.on("click", () =>
        {
            this._onCancelButtonClicked();
        });

        this._onLoadedCallback();
    }

    _onApplyButtonClicked()
    {
        this._setLoadingState(true);
        let regionsToInclude = this._domRegionsSelect.multipleSelect("getSelects", "text");
        this._presetsRepo.loadPreset(this._preset)
            .then(txt => {
                const txtAfterRegions = this._presetsRepo.removeUncheckedRegions(txt, regionsToInclude);
                this._cliEngine.send(txtAfterRegions, () => { this._onPresetApplied(); });
            })
            .catch(err => {
                console.log(err);
                let msg = i18n.getMessage("presetsLoadError");
                this._showError(msg);
            });
    }

    _onPresetApplied()
    {
        this._onCancelButtonClicked();
    }

    _onCancelButtonClicked()
    {
        this._destroyRegionsSelect();
        this._domDialog[0].close();
    }
}
