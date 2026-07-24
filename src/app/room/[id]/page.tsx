import { RoomLobby } from "@/components/RoomLobby";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RoomPage({ params }: Props) {
  const { id } = await params;
  return <RoomLobby roomId={id} />;
}
