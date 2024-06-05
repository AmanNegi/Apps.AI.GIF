import {
    ApiEndpoint,
    IApiEndpointInfo,
    IApiRequest,
    IApiResponse,
} from "@rocket.chat/apps-engine/definition/api";
import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { OnGoingGenPersistence } from "../persistence/OnGoingGenPersistence";
import { IUpdateEndpointContent } from "../../definition/endpoint/IEndpointContent";
import { GenerationPersistence } from "../persistence/GenerationPersistence";

export class GifStatusUpdateEndpoint extends ApiEndpoint {
    path = "gif-status-update";

    public async post(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<IApiResponse> {
        this.app
            .getLogger()
            .log("GifUpdateStatusEndpoint.post", request.content);

        const content = request.content as IUpdateEndpointContent;

        const onGoingGenPeristence = new OnGoingGenPersistence(
            persis,
            read.getPersistenceReader()
        );

        const record = await onGoingGenPeristence.getRecordById(content.id);

        if (!record) {
            this.app.getLogger().log("Record not found");
            return {
                status: 404,
                content: {
                    message: "Record not found",
                },
            };
        }

        const sender = await read.getUserReader().getById(record.uid);
        const room = await read.getRoomReader().getById(record.roomId);

        if (!sender || !room) {
            return {
                status: 404,
                content: {
                    text: "User or Room not found",
                },
            };
        }

        const res = await http.get(content.output, {
            encoding: null,
        });

        if (res && res.content) {
            const buffer = Buffer.from(res.content);
            const upload = await modify
                .getCreator()
                .getUploadCreator()
                .uploadBuffer(buffer, {
                    filename: `${
                        record.prompt
                    }${Date.now().toPrecision(8)}.gif`,
                    room,
                    user: sender,
                });

            console.log(upload);
        }

        // delete record from generation persistence
        await onGoingGenPeristence.deleteRecordById(content.id);

        const generationPersistence = new GenerationPersistence(
            record.uid,
            persis,
            read.getPersistenceReader()
        );

        await generationPersistence.add({
            query: record.prompt,
            url: content.output,
        });

        return {
            status: 200,
            content: {
                message: "Gif updated",
                ...request.content,
            },
        };
    }
}
