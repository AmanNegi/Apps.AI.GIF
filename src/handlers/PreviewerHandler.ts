import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { AiGifApp } from "../../AiGifApp";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { IPreviewerUtilityParams } from "../../definition/command/ICommandUtility";
import { RequestDebouncer } from "../helper/RequestDebouncer";
import {
    ISlashCommandPreview,
    SlashCommandPreviewItemType,
} from "@rocket.chat/apps-engine/definition/slashcommands/ISlashCommandPreview";
import { GenerationPersistence } from "../persistence/GenerationPersistence";
import { RedefinedPrompt } from "../lib/RedefinePrompt";
import { sendMessageToSelf } from "../utils/message";

export class PreviewerHandler {
    app: AiGifApp;
    params: string[];
    sender: IUser;
    room: IRoom;
    read: IRead;
    modify: IModify;
    http: IHttp;
    persis: IPersistence;
    triggerId?: string | undefined;
    threadId?: string | undefined;
    requestDebouncer: RequestDebouncer;

    constructor(props: IPreviewerUtilityParams) {
        this.app = props.app;
        this.params = props.params;
        this.sender = props.sender;
        this.room = props.room;
        this.read = props.read;
        this.modify = props.modify;
        this.http = props.http;
        this.persis = props.persis;
        this.triggerId = props.triggerId;
        this.threadId = props.threadId;
        this.requestDebouncer = props.requestDebouncer;
    }

    async executeCustomPrompt(): Promise<ISlashCommandPreview> {
        const prompt = this.params[1];

        const redefinePrompt = new RedefinedPrompt();

        const profanityRes = await redefinePrompt.performProfanityCheck(
            prompt,
            this.sender.id,
            this.http,
            this.app.getLogger()
        );

        if (profanityRes && profanityRes.containsProfanity) {
            sendMessageToSelf(
                this.modify,
                this.room,
                this.sender,
                this.threadId,
                `The text contains profanity. Please provide a different text. \nDetected Words: ${profanityRes.profaneWords.join(
                    ", "
                )}`
            );
            return {
                i18nTitle: "PreviewTitle_Profanity_Error",
                items: [],
            };
        }

        const res = await this.requestDebouncer.debouncedSyncGifRequest(
            prompt,
            this.app,
            this.http,
            this.read,
            this.modify,
            this.persis,
            this.room,
            this.sender,
            this.threadId
        );

        if (!res) {
            return {
                i18nTitle: "PreviewTitle_Loading",
                items: [],
            };
        }

        return {
            i18nTitle: "PreviewTitle_Generated",
            items: [
                {
                    id: prompt,
                    type: SlashCommandPreviewItemType.IMAGE,
                    value: res,
                },
            ],
        };
    }

    async executePromptGeneration(): Promise<ISlashCommandPreview> {
        const prompt = this.params[1];

        const res = await this.requestDebouncer.debouncedPromptVariationRequest(
            prompt,
            this.http,
            this.app.getLogger(),
            this.sender,
            this.room,
            this.modify,
            this.threadId
        );

        const items = res.map((item) => {
            return {
                id: item.prompt,
                type: SlashCommandPreviewItemType.TEXT,
                value: item.prompt,
            };
        });

        return {
            i18nTitle: "PreviewTitle_Generated",
            items,
        };
    }

    async executeHistory(): Promise<ISlashCommandPreview> {
        const generationPersistence = new GenerationPersistence(
            this.sender.id,
            this.persis,
            this.read.getPersistenceReader()
        );

        const gifs = await generationPersistence.getAllItems();

        return {
            i18nTitle: "PreviewTitle_Past_Creations",
            items: gifs.map((gif) => ({
                id: gif.query,
                type: SlashCommandPreviewItemType.IMAGE,
                value: gif.url,
            })),
        };
    }
}
