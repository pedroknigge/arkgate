type Res = { send(body: unknown): void };
type Subject = { subscribe(name: string): void };
type Socket = { send(body: string): void };

export function handle(res: Res, body: unknown, subject: Subject, socket: Socket): void {
  res.send('ok');
  res.send(body);
  subject.subscribe('x');
  socket.send('hello');
  const emitter = { publish(name: string) { return name; } };
  emitter.publish('local');
  void require.resolve('some-package');
}
