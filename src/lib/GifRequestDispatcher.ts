import {
    IHttp,
    IModify,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { getSettingFromId } from "../utils/prefs";
import { Preferences } from "../enum/Preferences";
import { IGifRequestBody } from "../../definition/lib/IGifRequestBody";
import {
    IGetGifResponse,
    IGifResponseData,
    PredictionStatus,
} from "../../definition/lib/IGifResponseData";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { sendMessageVisibleToSelf } from "../utils/message";
import { AiGifApp } from "../../AiGifApp";
import { InfoMessages } from "../enum/messages";
import { URL } from "url";

export class GifRequestDispatcher {
    constructor(
        private readonly app: AiGifApp,
        private readonly http: IHttp,
        private readonly read: IRead,
        private readonly modify: IModify,
        private readonly room: IRoom,
        private readonly sender: IUser,
        private readonly threadId: string | undefined
    ) {}

    async validatePreferences(): Promise<boolean> {
        const apiKey = await getSettingFromId(this.read, Preferences.API_KEY);
        const webhookUrl = await getSettingFromId(
            this.read,
            Preferences.WEBHOOK_URL
        );
        const apiUrl = await getSettingFromId(this.read, Preferences.API_URL);
        const modelId = await getSettingFromId(this.read, Preferences.MODEL_ID);

        const settings = [
            {
                key: Preferences.API_KEY,
                value: apiKey,
                message: InfoMessages.API_KEY_NOT_SET,
            },
            {
                key: Preferences.WEBHOOK_URL,
                value: webhookUrl,
                message: InfoMessages.WEBHOOK_URL_NOT_SET,
            },
            {
                key: Preferences.API_URL,
                value: apiUrl,
                message: InfoMessages.API_URL_NOT_SET,
            },
            {
                key: Preferences.MODEL_ID,
                value: modelId,
                message: InfoMessages.MODEL_ID_NOT_SET,
            },
        ];

        const botUser = (await this.read.getUserReader().getAppUser()) as IUser;
        for (const setting of settings) {
            if (!setting.value || setting.value === "") {
                this.app.getLogger().log(setting.message);
                sendMessageVisibleToSelf(
                    this.modify,
                    this.room,
                    this.sender,
                    botUser,
                    this.threadId,
                    setting.message
                );
                return false;
            }

            if (
                setting.key === Preferences.WEBHOOK_URL ||
                setting.key === Preferences.API_URL
            ) {
                try {
                    new URL(setting.value);
                } catch (e) {
                    const errorMessage = `Invalid URL assigned to ${setting.key}: ${setting.value}`;
                    this.app.getLogger().log(errorMessage);
                    sendMessageVisibleToSelf(
                        this.modify,
                        this.room,
                        this.sender,
                        botUser,
                        this.threadId,
                        errorMessage
                    );
                    return false;
                }
            }
        }

        return true;
    }

    async generateGif(prompt: string): Promise<IGifResponseData | Error> {
        const apiUrl = await getSettingFromId(this.read, Preferences.API_URL);
        const apiKey = await getSettingFromId(this.read, Preferences.API_KEY);
        const modelId = await getSettingFromId(this.read, Preferences.MODEL_ID);
        const webhookUrl = await getSettingFromId(
            this.read,
            Preferences.WEBHOOK_URL
        );

        if (!apiKey || !apiUrl || !modelId || !webhookUrl) {
            const errorMessage =
                "ValidationError: One or more preferences are not set";
            this.app.getLogger().log(errorMessage);
            throw new Error(errorMessage);
        }

        const requestBody: IGifRequestBody = {
            version: modelId,
            webhook: webhookUrl,
            input: {
                mp4: false,
                steps: 30,
                width: 256,
                height: 256,
                prompt,
                negative_prompt: "blurry",
            },
        };

        const res = await this.http.post(apiUrl, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            data: requestBody,
        });

        if (!res || !res.data || res.statusCode !== 201) {
            const responseData = res.data as IGifResponseData;

            if (
                responseData.status === PredictionStatus.FAILED ||
                responseData.status === PredictionStatus.CANCELLED
            ) {
                this.app.getLogger().log(responseData.error);
                throw new Error(responseData.error);
            }
        }

        return res.data as IGifResponseData;
    }

    async mockGenerateGif(id: string): Promise<IGifResponseData> {
        const webhookUrl = await getSettingFromId(
            this.read,
            Preferences.WEBHOOK_URL
        );

        setTimeout(() => {
            this.http.post(webhookUrl!, {
                data: {
                    id,
                    output: "https://i.giphy.com/vzO0Vc8b2VBLi.gif",
                },
            });
        }, 5000);

        return {
            id: id,
            status: PredictionStatus.SUCCEEDED,
            error: "",
        };
    }

    async syncGenerateGif(prompt: string): Promise<string | undefined> {
        const apiUrl = await getSettingFromId(this.read, Preferences.API_URL);
        const apiKey = await getSettingFromId(this.read, Preferences.API_KEY);
        const modelId = await getSettingFromId(this.read, Preferences.MODEL_ID);

        if (!apiKey || !apiUrl || !modelId) {
            const errorMessage =
                "ValidationError: One or more preferences are not set";
            this.app.getLogger().log(errorMessage);
            return undefined;
        }

        const requestBody: IGifRequestBody = {
            version: modelId,
            input: {
                mp4: false,
                steps: 30,
                width: 256,
                height: 256,
                prompt,
                negative_prompt: "blurry",
            },
        };

        const headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };

        const res = await this.http.post(apiUrl, {
            headers: headers,
            data: requestBody,
        });

        const genResponse = res.data as IGifResponseData;

        let status: PredictionStatus = PredictionStatus.STARTING;
        let output: string | undefined;

        const breakCases = [
            PredictionStatus.SUCCEEDED,
            PredictionStatus.FAILED,
            PredictionStatus.CANCELLED,
        ];

        while (!breakCases.includes(status)) {
            await this.waitForMillis(5000);

            const res = await this.http.get(genResponse.urls!.get, {
                headers: headers,
            });

            const getResponse = res.data as IGetGifResponse;
            status = getResponse.status;
            if (getResponse.output) {
                output = getResponse.output;
            }
        }

        if (status === PredictionStatus.SUCCEEDED && output) {
            return output;
        }

        return undefined;
    }

    async mockSyncGenerateGif(prompt: string): Promise<string> {
        await this.waitForMillis(2000);

        return "https://i.giphy.com/vzO0Vc8b2VBLi.gif";
    }

    async waitForMillis(millis: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, millis));
    }
}
