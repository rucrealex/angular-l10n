import { Injectable, Inject } from "@angular/core";
import { Router, NavigationStart, NavigationEnd } from "@angular/router";
import { Location } from "@angular/common";
import { filter } from "rxjs/operators";

import { LOCALE_CONFIG, LOCALIZED_ROUTING, LocaleConfig, LocalizedRoutingConfig } from "./l10n-config";
import { InjectorRef } from "./injector-ref";
import { LocaleService } from "../services/locale.service";
import { LocaleCodes, ISOCode, ExtraCode, Schema } from "./types";

@Injectable() export class LocalizedRouting {

    private router: Router;
    private location: Location;

    constructor(
        @Inject(LOCALE_CONFIG) private localeConfig: LocaleConfig,
        @Inject(LOCALIZED_ROUTING) private localizedRoutingConfig: LocalizedRoutingConfig,
        private locale: LocaleService
    ) { }

    public init(): void {
        if (this.localizedRoutingConfig.format) {
            this.router = InjectorRef.get(Router);
            this.location = InjectorRef.get(Location);

            // Parses the url to find the locale when the app starts.
            const path: string = this.location.path();
            this.parsePath(path);

            // Parses the url to find the locale when a navigation starts.
            this.router.events.pipe(
                filter((event: any) => event instanceof NavigationStart)
            ).subscribe((data: NavigationStart) => {
                this.redirectToPath(data.url);
            });
            // Replaces url when a navigation ends.
            this.router.events.pipe(
                filter((event: any) => event instanceof NavigationEnd)
            ).subscribe((data: NavigationEnd) => {
                const url: string = (!!data.url && data.url != "/" && data.url == data.urlAfterRedirects) ?
                    data.url :
                    data.urlAfterRedirects;
                this.replacePath(this.locale.composeLocale(this.localizedRoutingConfig.format!), url);
            });

            // Replaces url when locale changes.
            this.locale.languageCodeChanged.subscribe(() => {
                this.replacePath(this.locale.composeLocale(this.localizedRoutingConfig.format!));
            });
            this.locale.defaultLocaleChanged.subscribe(() => {
                this.replacePath(this.locale.composeLocale(this.localizedRoutingConfig.format!));
            });
        }
    }

    /**
     * Parses path to find the locale.
     * @param path The path to be parsed
     */
    private parsePath(path?: string): void {
        if (!path) return;
        const segment: string | null = this.getLocalizedSegment(path);
        if (segment != null) {
            const locale: string = segment!.replace(/\//gi, "");
            const localeCodes: LocaleCodes = this.splitLocale(locale, this.localizedRoutingConfig.format!);

            // Unrecognized segment.
            if (this.localizedRoutingConfig.schema) {
                if (!this.compareLocale(localeCodes,
                    {
                        languageCode: localeCodes.languageCode,
                        scriptCode: this.getSchema(ISOCode.Script, localeCodes),
                        countryCode: this.getSchema(ISOCode.Country, localeCodes)
                    })
                ) return;
            }

            if (this.localeConfig.language) {
                this.locale.setCurrentLanguage(localeCodes.languageCode);
            }
            if (this.localeConfig.defaultLocale) {
                this.locale.setDefaultLocale(
                    localeCodes.languageCode,
                    localeCodes.countryCode || this.getSchema(ISOCode.Country, localeCodes),
                    localeCodes.scriptCode || this.getSchema(ISOCode.Script, localeCodes),
                    this.getSchema(ExtraCode.NumberingSystem, localeCodes),
                    this.getSchema(ExtraCode.Calendar, localeCodes)
                );
            }
            if (this.localeConfig.currency) {
                const currency: string | undefined = this.getSchema(ExtraCode.Currency, localeCodes);
                if (currency) {
                    this.locale.setCurrentCurrency(currency);
                }
            }
            if (this.localeConfig.timezone) {
                const timezone: string | undefined = this.getSchema(ExtraCode.Timezone, localeCodes);
                if (timezone) {
                    this.locale.setCurrentTimezone(timezone);
                }
            }
        }
    }

    /**
     * Removes the locale from the path and navigates without pushing a new state into history.
     * @param path Localized path
     */
    private redirectToPath(path: string): void {
        const segment: string | null = this.getLocalizedSegment(path);
        if (segment != null) {
            const url: string = path.replace(segment, "/");
            // navigateByUrl keeps the query params.
            this.router.navigateByUrl(url, { skipLocationChange: true });
        }
    }

    /**
     * Replaces the path with the locale without pushing a new state into history.
     * @param locale The current locale
     * @param path The path to be replaced
     */
    private replacePath(locale: string, path?: string): void {
        if (path) {
            if (!this.isDefaultRouting()) {
                this.location.replaceState(this.getLocalizedPath(locale, path));
            }
        } else {
            path = this.location.path();
            // Parses the path to find the locale.
            const segment: string | null = this.getLocalizedSegment(path);
            if (segment != null) {
                // Removes the locale from the path.
                path = path.replace(segment, "/");

                if (this.isDefaultRouting()) {
                    this.location.replaceState(path);
                }
            }
            if (!this.isDefaultRouting()) {
                this.location.replaceState(this.getLocalizedPath(locale, path));
            }
        }
    }

    private getLocalizedSegment(path: string): string | null {
        for (const lang of this.locale.getAvailableLanguages()) {
            const regex: RegExp = new RegExp(`(^\/${lang}\/)|(^\/${lang}$)|(^\/${lang}-.*?\/)|(^\/${lang}-.*?$)`);
            const segments: RegExpMatchArray | null = path.match(regex);
            if (segments != null) {
                return segments[0];
            }
        }
        return null;
    }

    private splitLocale(locale: string, codes: ISOCode[]): LocaleCodes {
        const values: string[] = locale.split("-");
        const localeCodes: LocaleCodes = { languageCode: "" };
        if (codes.length > 0) {
            for (let i: number = 0; i < codes.length; i++) {
                localeCodes[codes[i]] = values[i] || undefined;
            }
        }
        return localeCodes;
    }

    private compareLocale(locale1: LocaleCodes, locale2: LocaleCodes): boolean {
        return locale1.languageCode == locale2.languageCode &&
            (!!locale1.scriptCode ?
                locale1.scriptCode == locale2.scriptCode : true) &&
            (!!locale1.countryCode ?
                locale1.countryCode == locale2.countryCode : true);
    }

    private getSchema(code: string, locale: LocaleCodes): string | undefined {
        if (!this.localizedRoutingConfig.schema) return undefined;
        const schema: any = this.localizedRoutingConfig.schema
            .find(((s: Schema) => this.compareLocale(locale, s)));
        return schema ? schema[code] : undefined;
    }

    private isDefaultRouting(): boolean {
        if (!this.localizedRoutingConfig.defaultRouting) return false;
        if (this.localeConfig.language) {
            return this.locale.getCurrentLanguage() == this.localeConfig.language;
        }
        if (this.localeConfig.defaultLocale) {
            return this.compareLocale(
                {
                    languageCode: this.locale.getCurrentLanguage(),
                    scriptCode: this.locale.getCurrentScript(),
                    countryCode: this.locale.getCurrentCountry()
                },
                this.localeConfig.defaultLocale
            );
        }
        return false;
    }

    private getLocalizedPath(locale: string, path: string): string {
        return Location.stripTrailingSlash("/" + locale + path);
    }

}
