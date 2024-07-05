import {
    IPersistence,
    IPersistenceRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import {
    RocketChatAssociationModel,
    RocketChatAssociationRecord,
} from "@rocket.chat/apps-engine/definition/metadata";

interface GenerationRecord {
    query: string;
    url: string;
}

interface GenerationRecordWrapper {
    generated_gifs: GenerationRecord[];
}

export class GenerationPersistence {
    private key = "gen-gif";

    constructor(
        readonly userId: string,
        readonly persistence: IPersistence,
        readonly persistenceRead: IPersistenceRead
    ) {}

    async getAll() {
        const res = await this.persistenceRead.readByAssociations([
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.MISC,
                this.key
            ),
            new RocketChatAssociationRecord(
                RocketChatAssociationModel.USER,
                this.userId
            ),
        ]);
        return res;
    }

    async getAllItems(): Promise<GenerationRecord[]> {
        const records = await this.getAll();
        if (records.length == 0) {
            return [];
        }
        return (records[0] as GenerationRecordWrapper).generated_gifs;
    }

    async add(record: GenerationRecord): Promise<void> {
        const records = await this.getAll();

        if (!records || records.length == 0) {
            await this.persistence.createWithAssociations(
                {
                    generated_gifs: [record],
                },
                [
                    new RocketChatAssociationRecord(
                        RocketChatAssociationModel.MISC,
                        this.key
                    ),
                    new RocketChatAssociationRecord(
                        RocketChatAssociationModel.USER,
                        this.userId
                    ),
                ]
            );
        } else {
            await this.persistence.updateByAssociations(
                [
                    new RocketChatAssociationRecord(
                        RocketChatAssociationModel.MISC,
                        this.key
                    ),

                    new RocketChatAssociationRecord(
                        RocketChatAssociationModel.USER,
                        this.userId
                    ),
                ],
                {
                    generated_gifs: [
                        record,
                        ...(records[0] as GenerationRecordWrapper)
                            .generated_gifs,
                    ],
                }
            );
        }
    }
}